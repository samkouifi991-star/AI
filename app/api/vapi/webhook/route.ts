import { NextRequest, NextResponse } from 'next/server';
import { supabaseServiceRole } from '@/lib/supabase/admin';
import { retrieveAndAnswer } from '@/lib/rag';
import { calculateEstimate, PricingRule } from '@/lib/pricing';
import { getFreeBusy, createCalendarEvent } from '@/lib/calendar';
import { sendSms, appointmentConfirmationSms } from '@/lib/twilio';
import { detectLanguage, translateText, SUPPORTED_LANGUAGES } from '@/lib/language';
import { computeOrderTotals, createOrderPaymentLink, releaseExpiredHolds, lineTotal, OrderItemInput } from '@/lib/orders';

type VoiceSettings = {
  default_language: string;
  additional_languages: string[];
  auto_detect_language: boolean;
  confirm_before_switch: boolean;
};

async function getVoiceSettings(
  supabase: ReturnType<typeof supabaseServiceRole>,
  businessId: string
): Promise<VoiceSettings> {
  const { data } = await supabase
    .from('business_voice_settings')
    .select('default_language, additional_languages, auto_detect_language, confirm_before_switch')
    .eq('business_id', businessId)
    .single();

  return (
    data ?? {
      default_language: 'en',
      additional_languages: [],
      auto_detect_language: false,
      confirm_before_switch: true
    }
  );
}

/**
 * Single webhook that Vapi (or Retell/Bland) calls for:
 *  1. Tool/function calls made mid-conversation ("check_availability", etc.)
 *  2. End-of-call reports (transcript, recording, summary)
 *
 * Verify the shared secret Vapi sends so this endpoint can't be spoofed.
 */
function verifyWebhookSecret(req: NextRequest): boolean {
  const provided = req.headers.get('x-vapi-secret');
  return provided === process.env.VAPI_WEBHOOK_SECRET;
}

export async function POST(req: NextRequest) {
  if (!verifyWebhookSecret(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const supabase = supabaseServiceRole();

  // Vapi sends { message: { type: 'function-call' | 'end-of-call-report' | ..., ... } }
  const message = body.message ?? body;

  const businessIdForStatus: string | undefined = message?.call?.metadata?.businessId;
  if (businessIdForStatus) {
    await supabase
      .from('webhook_status')
      .upsert(
        { business_id: businessIdForStatus, webhook_type: 'vapi', last_received_at: new Date().toISOString(), last_status: 'ok', failure_count: 0 },
        { onConflict: 'business_id,webhook_type' }
      );
  }

  switch (message.type) {
    case 'function-call':
      return handleFunctionCall(message, supabase);

    case 'end-of-call-report':
      return handleEndOfCall(message, supabase);

    default:
      return NextResponse.json({ ok: true });
  }
}

async function handleFunctionCall(message: any, supabase: ReturnType<typeof supabaseServiceRole>) {
  const { functionCall, call } = message;
  const name: string = functionCall?.name;
  const params = functionCall?.parameters ?? {};
  const businessId: string = call?.metadata?.businessId; // set when the call is dispatched

  if (!businessId) {
    return NextResponse.json({ result: 'Missing business context.' }, { status: 400 });
  }

  switch (name) {
    case 'get_business_knowledge': {
      const { answer } = await retrieveAndAnswer(businessId, params.question);

      const callRowId: string | undefined = call?.metadata?.callRowId;
      let activeLanguage = 'en';
      if (callRowId) {
        const { data: callRow } = await supabase
          .from('calls')
          .select('active_language')
          .eq('id', callRowId)
          .single();
        activeLanguage = callRow?.active_language ?? 'en';
      }

      // Single knowledge base, translated on the way out — keeps the
      // business from maintaining separate content per language.
      const translated = activeLanguage === 'en' ? answer : await translateText(answer, activeLanguage);

      return NextResponse.json({ result: translated });
    }

    // Called by the assistant when it wants to check what language the
    // caller is speaking. Constrained to languages the business has
    // actually enabled, so detection never suggests switching to a
    // language nobody configured.
    case 'detect_language': {
      const voiceSettings = await getVoiceSettings(supabase, businessId);
      if (!voiceSettings.auto_detect_language) {
        return NextResponse.json({ result: 'auto_detect_disabled' });
      }

      const candidates = [voiceSettings.default_language, ...voiceSettings.additional_languages];
      const detection = await detectLanguage(params.utterance, candidates);

      const callRowId: string | undefined = call?.metadata?.callRowId;
      const { data: callRow } = callRowId
        ? await supabase.from('calls').select('active_language').eq('id', callRowId).single()
        : { data: null };
      const currentLanguage = callRow?.active_language ?? voiceSettings.default_language;

      if (callRowId) {
        await supabase.from('calls').update({ detected_language: detection.languageCode }).eq('id', callRowId);
      }

      const sameLanguage = detection.languageCode === currentLanguage;
      const action = sameLanguage
        ? 'detected_only'
        : voiceSettings.confirm_before_switch
        ? 'asked_to_confirm'
        : 'switched';

      await supabase.from('language_detection_events').insert({
        business_id: businessId,
        call_id: callRowId,
        utterance: params.utterance,
        detected_language: detection.languageCode,
        confidence: detection.confidence,
        action
      });

      if (sameLanguage) {
        return NextResponse.json({ result: 'same_language', detected_language: detection.languageCode });
      }

      if (!voiceSettings.confirm_before_switch) {
        if (callRowId) await supabase.from('calls').update({ active_language: detection.languageCode }).eq('id', callRowId);
        return NextResponse.json({ result: 'switched', detected_language: detection.languageCode });
      }

      const label = SUPPORTED_LANGUAGES.find((l) => l.code === detection.languageCode)?.label ?? detection.languageCode;
      return NextResponse.json({
        result: 'confirm_required',
        detected_language: detection.languageCode,
        message_to_customer: `It sounds like you might prefer ${label} — would you like me to continue in ${label}?`
      });
    }

    // Called after the assistant has asked the caller to confirm a
    // language switch (or immediately, if confirm_before_switch is off).
    case 'switch_language': {
      const callRowId: string | undefined = call?.metadata?.callRowId;
      const confirmed = params.confirmed === true;

      if (!confirmed) {
        if (callRowId) {
          await supabase.from('language_detection_events').insert({
            business_id: businessId,
            call_id: callRowId,
            detected_language: params.target_language,
            action: 'declined'
          });
        }
        return NextResponse.json({ result: 'declined' });
      }

      if (callRowId) {
        await supabase.from('calls').update({ active_language: params.target_language }).eq('id', callRowId);
        await supabase.from('language_detection_events').insert({
          business_id: businessId,
          call_id: callRowId,
          detected_language: params.target_language,
          action: 'switched'
        });
      }

      return NextResponse.json({ result: 'switched', active_language: params.target_language });
    }

    case 'calculate_estimate': {
      const { data: rule, error } = await supabase
        .from('pricing_rules')
        .select('*')
        .eq('business_id', businessId)
        .eq('id', params.pricing_rule_id)
        .single();

      if (error || !rule) {
        return NextResponse.json({
          result:
            "I don't have a pricing rule set up for that yet — I'll have the team follow up with a quote."
        });
      }

      const estimate = calculateEstimate(rule as PricingRule, {
        quantity: params.quantity,
        selections: params.selections ?? {}
      });

      return NextResponse.json({
        result: `Based on what you've described, that would run roughly $${estimate.low} to $${estimate.high}. This is an estimate — a final price is confirmed after an on-site visit.`,
        estimate
      });
    }

    case 'check_availability': {
      const { data: conn } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('business_id', businessId)
        .single();

      if (!conn) {
        return NextResponse.json({
          result: "I'm not able to check the calendar right now — I'll have someone reach out to schedule."
        });
      }

      const busy = await getFreeBusy(
        conn.access_token,
        conn.refresh_token,
        conn.calendar_id,
        params.window_start,
        params.window_end
      );

      return NextResponse.json({ result: busy.length === 0 ? 'available' : 'has_conflicts', busy });
    }

    case 'save_lead': {
      const { data: lead, error } = await supabase
        .from('leads')
        .insert({
          business_id: businessId,
          call_id: call?.metadata?.callRowId,
          name: params.name,
          phone: params.phone,
          email: params.email,
          address: params.address,
          project_details: params.project_details ?? {},
          status: 'new'
        })
        .select()
        .single();

      if (error) return NextResponse.json({ result: 'Failed to save lead.' }, { status: 500 });
      return NextResponse.json({ result: 'lead_saved', lead_id: lead.id });
    }

    case 'book_appointment': {
      const { data: conn } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('business_id', businessId)
        .single();

      const { data: business } = await supabase
        .from('businesses')
        .select('name, timezone')
        .eq('id', businessId)
        .single();

      let calendarEventId: string | undefined;
      if (conn) {
        const event = await createCalendarEvent({
          accessToken: conn.access_token,
          refreshToken: conn.refresh_token,
          calendarId: conn.calendar_id,
          summary: `${params.appointment_type ?? 'Estimate visit'} — ${params.name}`,
          description: params.notes,
          startIso: params.start_iso,
          endIso: params.end_iso,
          timezone: business?.timezone ?? 'America/New_York'
        });
        calendarEventId = event.id ?? undefined;
      }

      const { data: appt, error } = await supabase
        .from('appointments')
        .insert({
          business_id: businessId,
          lead_id: params.lead_id,
          calendar_event_id: calendarEventId,
          scheduled_at: params.start_iso,
          appointment_type: params.appointment_type ?? 'estimate_visit',
          status: 'scheduled'
        })
        .select()
        .single();

      if (error) return NextResponse.json({ result: 'Failed to book appointment.' }, { status: 500 });

      if (params.phone) {
        const smsResult = await sendSms(
          params.phone,
          appointmentConfirmationSms({
            businessName: business?.name ?? 'Your service provider',
            when: params.readable_time ?? params.start_iso,
            address: params.address
          })
        );
        if (smsResult.ok) {
          await supabase.from('appointments').update({ confirmation_sent: true }).eq('id', appt.id);
        }
        // If the SMS failed, the appointment is still booked — confirmation_sent
        // just stays false so the dashboard shows it needs a manual follow-up.
      }

      return NextResponse.json({ result: 'appointment_booked', appointment_id: appt.id });
    }

    case 'transfer_call': {
      // Vapi handles the actual SIP transfer when it receives this shape back.
      return NextResponse.json({
        result: 'transferring',
        transferTo: process.env.TWILIO_PHONE_NUMBER // replace with the owner's real cell/desk line
      });
    }

    // ===================== Restaurant ordering =====================
    // These five functions implement the full ordering flow described in
    // the assistant config: find items (with sizes/modifiers so the AI
    // knows what to ask about), build up a draft order across multiple
    // turns, get a running total to repeat back, let the customer edit
    // before confirming, and finalize with a real Stripe payment link.

    case 'find_menu_item': {
      const { data: items, error } = await supabase
        .from('menu_items')
        .select('id, name, description, base_price, sold_out, menu_item_sizes(id, label, price), menu_modifier_groups(id, name, selection_type, required, menu_modifier_options(id, label, price_delta))')
        .eq('business_id', businessId)
        .ilike('name', `%${params.query}%`)
        .limit(5);

      if (error) return NextResponse.json({ result: 'Could not search the menu right now.' }, { status: 500 });
      if (!items || items.length === 0) {
        return NextResponse.json({ result: 'no_match', matches: [] });
      }
      return NextResponse.json({ result: 'found', matches: items });
    }

    case 'add_order_item': {
      const callRowId: string | undefined = call?.metadata?.callRowId;

      let { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('call_id', callRowId ?? '')
        .not('status', 'in', '(completed,cancelled,refunded)')
        .maybeSingle();

      if (!order) {
        const { data: newOrder, error: createError } = await supabase
          .from('orders')
          .insert({
            business_id: businessId,
            call_id: callRowId,
            order_type: params.order_type === 'delivery' ? 'delivery' : 'pickup',
            status: 'draft'
          })
          .select()
          .single();
        if (createError || !newOrder) {
          return NextResponse.json({ result: 'Could not start the order.' }, { status: 500 });
        }
        order = newOrder;
      }

      const { data: menuItem } = await supabase
        .from('menu_items')
        .select('id, name, base_price, sold_out, menu_item_sizes(label, price)')
        .eq('business_id', businessId)
        .ilike('name', `%${params.menu_item_name}%`)
        .limit(1)
        .maybeSingle();

      if (!menuItem) {
        return NextResponse.json({ result: `Couldn't find "${params.menu_item_name}" on the menu.` });
      }
      if (menuItem.sold_out) {
        return NextResponse.json({ result: `${menuItem.name} is sold out right now — want something else instead?` });
      }

      let unitPrice = Number(menuItem.base_price);
      if (params.size_label) {
        const sizeMatch = (menuItem.menu_item_sizes as any[])?.find(
          (s) => s.label.toLowerCase() === String(params.size_label).toLowerCase()
        );
        if (sizeMatch) unitPrice = Number(sizeMatch.price);
      }

      const modifiers = Array.isArray(params.modifiers) ? params.modifiers : [];
      const itemInput: OrderItemInput = {
        menu_item_id: menuItem.id,
        name_snapshot: menuItem.name,
        size_label: params.size_label ?? null,
        unit_price: unitPrice,
        quantity: Number(params.quantity) || 1,
        modifiers,
        special_instructions: params.special_instructions ?? null
      };

      const line_total = lineTotal(itemInput);

      const { error: itemInsertError } = await supabase.from('order_items').insert({
        order_id: order.id,
        menu_item_id: itemInput.menu_item_id,
        name_snapshot: itemInput.name_snapshot,
        size_label: itemInput.size_label,
        unit_price: itemInput.unit_price,
        quantity: itemInput.quantity,
        modifiers: itemInput.modifiers,
        special_instructions: itemInput.special_instructions,
        line_total
      });

      if (itemInsertError) {
        return NextResponse.json({ result: 'Could not add that item.' }, { status: 500 });
      }

      return NextResponse.json({ result: 'item_added', order_id: order.id, item: itemInput.name_snapshot, line_total });
    }

    case 'remove_order_item': {
      const callRowId: string | undefined = call?.metadata?.callRowId;
      const { data: order } = await supabase
        .from('orders')
        .select('id')
        .eq('call_id', callRowId ?? '')
        .not('status', 'in', '(completed,cancelled,refunded)')
        .maybeSingle();

      if (!order) return NextResponse.json({ result: 'No active order to remove from.' });

      const { data: match } = await supabase
        .from('order_items')
        .select('id, name_snapshot')
        .eq('order_id', order.id)
        .ilike('name_snapshot', `%${params.item_description}%`)
        .limit(1)
        .maybeSingle();

      if (!match) return NextResponse.json({ result: `Couldn't find "${params.item_description}" in the order.` });

      await supabase.from('order_items').delete().eq('id', match.id);
      return NextResponse.json({ result: 'item_removed', item: match.name_snapshot });
    }

    case 'get_order_summary': {
      const callRowId: string | undefined = call?.metadata?.callRowId;
      const { data: order } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('call_id', callRowId ?? '')
        .not('status', 'in', '(completed,cancelled,refunded)')
        .maybeSingle();

      if (!order || !order.order_items?.length) {
        return NextResponse.json({ result: 'No items in the order yet.' });
      }

      const { data: settings } = await supabase
        .from('restaurant_settings')
        .select('tax_rate, delivery_fee, discount_code, discount_percent')
        .eq('business_id', businessId)
        .single();

      const totals = computeOrderTotals({
        items: order.order_items,
        orderType: order.order_type,
        discountCode: params.discount_code,
        settings: settings ?? { tax_rate: 0, delivery_fee: 0, discount_code: null, discount_percent: null }
      });

      await supabase
        .from('orders')
        .update({ status: 'pending_confirmation', subtotal: totals.subtotal, tax: totals.tax, delivery_fee: totals.deliveryFee, discount: totals.discount, total: totals.total })
        .eq('id', order.id);

      const itemLines = order.order_items
        .map((i: any) => `${i.quantity} ${i.name_snapshot}${i.size_label ? ` (${i.size_label})` : ''}`)
        .join(', ');

      return NextResponse.json({
        result: `Your order includes ${itemLines}. Subtotal $${totals.subtotal.toFixed(2)}, tax $${totals.tax.toFixed(2)}${
          totals.deliveryFee ? `, delivery fee $${totals.deliveryFee.toFixed(2)}` : ''
        }${totals.discount ? `, discount -$${totals.discount.toFixed(2)}` : ''}. Total: $${totals.total.toFixed(2)}. Would you like to change anything?`,
        totals
      });
    }

    case 'confirm_order': {
      const callRowId: string | undefined = call?.metadata?.callRowId;
      const { data: order } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('call_id', callRowId ?? '')
        .not('status', 'in', '(completed,cancelled,refunded)')
        .maybeSingle();

      if (!order || !order.order_items?.length) {
        return NextResponse.json({ result: 'There is no order to confirm yet.' });
      }

      await releaseExpiredHolds(businessId);

      const { data: settings } = await supabase
        .from('restaurant_settings')
        .select('tax_rate, delivery_fee, discount_code, discount_percent, pay_at_pickup, pay_at_delivery')
        .eq('business_id', businessId)
        .single();

      const totals = computeOrderTotals({
        items: order.order_items,
        orderType: order.order_type,
        tipPercent: params.tip_percent,
        discountCode: params.discount_code,
        settings: settings ?? { tax_rate: 0, delivery_fee: 0, discount_code: null, discount_percent: null }
      });

      await supabase
        .from('orders')
        .update({
          customer_name: params.customer_name,
          customer_phone: params.customer_phone,
          customer_email: params.customer_email ?? null,
          subtotal: totals.subtotal,
          tax: totals.tax,
          delivery_fee: totals.deliveryFee,
          discount: totals.discount,
          tip: totals.tip,
          total: totals.total
        })
        .eq('id', order.id);

      const payAtPickup = order.order_type === 'pickup' && settings?.pay_at_pickup;
      const payAtDelivery = order.order_type === 'delivery' && settings?.pay_at_delivery;

      if (payAtPickup || payAtDelivery) {
        await supabase.from('orders').update({ status: 'accepted' }).eq('id', order.id);
        return NextResponse.json({
          result: `You're all set — total is $${totals.total.toFixed(2)}, due when your order is ${order.order_type === 'pickup' ? 'picked up' : 'delivered'}. The restaurant has your order now.`
        });
      }

      const link = await createOrderPaymentLink(order.id);
      if ('error' in link) {
        return NextResponse.json({ result: "I've got your order, but I'm having trouble generating the payment link — someone from the restaurant will follow up." });
      }

      if (params.customer_phone) {
        await sendSms(
          params.customer_phone,
          `Your order total is $${totals.total.toFixed(2)}. Pay here to confirm: ${link.url}`
        );
      }

      return NextResponse.json({
        result: `Your total is $${totals.total.toFixed(2)}. I've texted you a secure payment link — your order will be sent to the kitchen as soon as payment goes through.`,
        payment_url: link.url
      });
    }

    default:
      return NextResponse.json({ result: `Unknown function: ${name}` }, { status: 400 });
  }
}

async function handleEndOfCall(message: any, supabase: ReturnType<typeof supabaseServiceRole>) {
  const { call, transcript, recordingUrl, summary } = message;
  const businessId: string = call?.metadata?.businessId;
  const callRowId: string = call?.metadata?.callRowId;

  if (!businessId) return NextResponse.json({ ok: true });

  // Look up whatever language was actually detected/active during the call
  // so the call log and translated transcript are consistent with the
  // language events already recorded in language_detection_events.
  let finalLanguage = 'en';
  if (callRowId) {
    const { data: existing } = await supabase
      .from('calls')
      .select('active_language, detected_language')
      .eq('id', callRowId)
      .single();
    finalLanguage = existing?.active_language ?? existing?.detected_language ?? 'en';
  }

  const translatedTranscript =
    transcript && finalLanguage !== 'en' ? await translateText(transcript, 'en') : null;

  const updatePayload = {
    status: 'completed',
    transcript,
    translated_transcript: translatedTranscript,
    recording_url: recordingUrl,
    summary,
    ended_at: new Date().toISOString()
  };

  if (callRowId) {
    await supabase.from('calls').update(updatePayload).eq('id', callRowId);
  } else {
    await supabase.from('calls').insert({
      business_id: businessId,
      provider_call_id: call?.id,
      from_number: call?.customer?.number,
      to_number: call?.phoneNumber?.number,
      active_language: finalLanguage,
      ...updatePayload
    });
  }

  return NextResponse.json({ ok: true });
}
