import { supabaseServiceRole } from './supabase/admin';
import { retrieveAndAnswer } from './rag';
import { calculateEstimate, PricingRule } from './pricing';
import { getFreeBusy, createCalendarEvent } from './calendar';
import { sendSms, appointmentConfirmationSms } from './twilio';
import { detectLanguage, translateText, SUPPORTED_LANGUAGES } from './language';
import { computeOrderTotals, createOrderPaymentLink, releaseExpiredHolds, lineTotal, OrderItemInput } from './orders';
import { recordKnowledgeGap, isHumanHandoffRequest } from './knowledge-gaps';
import { groupBusinessHours, computeOpenStatus, formatTime12h, DAY_NAMES } from './hours';
import { logger } from './logger';

/**
 * The single implementation of every tool Ava can call, shared between a
 * real live call (app/api/vapi/webhook/route.ts) and a rehearsed one
 * (/practice). Both paths call dispatchTool() with the same tool names and
 * parameters Vapi would send — the only difference is `mode`, which gates
 * real-world side effects (SMS, Stripe, calendar writes) so a practice run
 * can exercise the exact same business logic without ever texting a real
 * customer, charging a real card, or writing a real calendar event.
 */

export type DispatchMode = 'live' | 'practice';

export interface DispatchContext {
  businessId: string;
  mode: DispatchMode;
  callId?: string | null; // live mode: the calls.id this tool call belongs to
  practiceSessionId?: string | null; // practice mode: the practice_sessions.id
}

type SupabaseClient = ReturnType<typeof supabaseServiceRole>;

async function getAiEmployeeSettings(supabase: SupabaseClient, businessId: string) {
  const { data } = await supabase
    .from('ai_employee_settings')
    .select('can_take_orders, can_quote_prices, can_book_appointments, can_offer_discounts, escalation_phone_number')
    .eq('business_id', businessId)
    .maybeSingle();

  return (
    data ?? {
      can_take_orders: true,
      can_quote_prices: true,
      can_book_appointments: true,
      can_offer_discounts: false,
      escalation_phone_number: null as string | null
    }
  );
}

async function getVoiceSettings(supabase: SupabaseClient, businessId: string) {
  const { data } = await supabase
    .from('business_voice_settings')
    .select('default_language, additional_languages, auto_detect_language, confirm_before_switch')
    .eq('business_id', businessId)
    .single();

  return (
    data ?? {
      default_language: 'en',
      additional_languages: [] as string[],
      auto_detect_language: false,
      confirm_before_switch: true
    }
  );
}

/** Looks up the in-progress order for this call/practice session, however it's keyed. */
async function getActiveOrder(supabase: SupabaseClient, ctx: DispatchContext) {
  let query = supabase.from('orders').select('*, order_items(*)').not('status', 'in', '(completed,cancelled,refunded)');
  query = ctx.mode === 'live' ? query.eq('call_id', ctx.callId ?? '') : query.eq('practice_session_id', ctx.practiceSessionId ?? '');
  const { data } = await query.maybeSingle();
  return data as any;
}

export async function dispatchTool(name: string, params: any, ctx: DispatchContext): Promise<Record<string, any>> {
  const supabase = supabaseServiceRole();
  const { businessId } = ctx;

  switch (name) {
    case 'get_business_knowledge': {
      const { answer } = await retrieveAndAnswer(businessId, params.question, {
        callId: ctx.callId,
        practiceSessionId: ctx.practiceSessionId,
        source: ctx.mode
      });

      let activeLanguage = 'en';
      if (ctx.mode === 'live' && ctx.callId) {
        const { data: callRow } = await supabase.from('calls').select('active_language').eq('id', ctx.callId).single();
        activeLanguage = callRow?.active_language ?? 'en';
      }

      const translated = activeLanguage === 'en' ? answer : await translateText(answer, activeLanguage);
      return { result: translated };
    }

    case 'check_business_hours': {
      const { data: business } = await supabase.from('businesses').select('timezone').eq('id', businessId).single();
      const timezone = business?.timezone ?? 'America/New_York';
      const [{ data: hoursRows }, { data: specialRows }] = await Promise.all([
        supabase.from('business_hours').select('day_of_week, open_time, close_time, is_closed').eq('business_id', businessId),
        supabase.from('special_hours').select('date, is_closed, open_time, close_time, note').eq('business_id', businessId)
      ]);
      const days = groupBusinessHours(hoursRows ?? []);

      if (params.day) {
        const dayIndex = DAY_NAMES.findIndex((d) => d.toLowerCase() === String(params.day).toLowerCase());
        if (dayIndex === -1) return { result: `"${params.day}" isn't a day of the week I recognize.` };
        const dayHours = days.find((d) => d.dayOfWeek === dayIndex);
        if (!dayHours || dayHours.isClosed) return { result: `We're closed on ${DAY_NAMES[dayIndex]}s.` };
        return { result: `On ${DAY_NAMES[dayIndex]}s we're open ${dayHours.ranges.map((r) => `${formatTime12h(r.openTime)}–${formatTime12h(r.closeTime)}`).join(', ')}.` };
      }

      const status = computeOpenStatus(new Date(), timezone, days, specialRows ?? []);
      if (status.isOpenNow) {
        return { result: `Yes, we're open right now. Today's hours: ${status.todayHoursLabel}.${status.note ? ` ${status.note}` : ''}` };
      }
      return {
        result:
          status.todayHoursLabel === 'closed'
            ? `We're closed today.${status.note ? ` ${status.note}` : ''}`
            : `We're closed right now. Today's hours are ${status.todayHoursLabel}.${status.note ? ` ${status.note}` : ''}`
      };
    }

    case 'detect_language': {
      if (ctx.mode !== 'live') return { result: 'not_available_in_practice' };

      const voiceSettings = await getVoiceSettings(supabase, businessId);
      if (!voiceSettings.auto_detect_language) return { result: 'auto_detect_disabled' };

      const candidates = [voiceSettings.default_language, ...voiceSettings.additional_languages];
      const detection = await detectLanguage(params.utterance, candidates);

      const { data: callRow } = ctx.callId
        ? await supabase.from('calls').select('active_language').eq('id', ctx.callId).single()
        : { data: null };
      const currentLanguage = callRow?.active_language ?? voiceSettings.default_language;

      if (ctx.callId) await supabase.from('calls').update({ detected_language: detection.languageCode }).eq('id', ctx.callId);

      const sameLanguage = detection.languageCode === currentLanguage;
      const action = sameLanguage ? 'detected_only' : voiceSettings.confirm_before_switch ? 'asked_to_confirm' : 'switched';

      await supabase.from('language_detection_events').insert({
        business_id: businessId,
        call_id: ctx.callId,
        utterance: params.utterance,
        detected_language: detection.languageCode,
        confidence: detection.confidence,
        action
      });

      if (sameLanguage) return { result: 'same_language', detected_language: detection.languageCode };

      if (!voiceSettings.confirm_before_switch) {
        if (ctx.callId) await supabase.from('calls').update({ active_language: detection.languageCode }).eq('id', ctx.callId);
        return { result: 'switched', detected_language: detection.languageCode };
      }

      const label = SUPPORTED_LANGUAGES.find((l) => l.code === detection.languageCode)?.label ?? detection.languageCode;
      return {
        result: 'confirm_required',
        detected_language: detection.languageCode,
        message_to_customer: `It sounds like you might prefer ${label} — would you like me to continue in ${label}?`
      };
    }

    case 'switch_language': {
      if (ctx.mode !== 'live') return { result: 'not_available_in_practice' };

      const confirmed = params.confirmed === true;
      if (!confirmed) {
        if (ctx.callId) {
          await supabase.from('language_detection_events').insert({
            business_id: businessId,
            call_id: ctx.callId,
            detected_language: params.target_language,
            action: 'declined'
          });
        }
        return { result: 'declined' };
      }

      if (ctx.callId) {
        await supabase.from('calls').update({ active_language: params.target_language }).eq('id', ctx.callId);
        await supabase.from('language_detection_events').insert({
          business_id: businessId,
          call_id: ctx.callId,
          detected_language: params.target_language,
          action: 'switched'
        });
      }
      return { result: 'switched', active_language: params.target_language };
    }

    case 'calculate_estimate': {
      const employeeSettings = await getAiEmployeeSettings(supabase, businessId);
      if (!employeeSettings.can_quote_prices) {
        return { result: "I'm not able to quote prices over the phone — I'll have the team follow up with a quote." };
      }

      const { data: rule, error } = await supabase
        .from('pricing_rules')
        .select('*')
        .eq('business_id', businessId)
        .eq('id', params.pricing_rule_id)
        .single();

      if (error || !rule) {
        return { result: "I don't have a pricing rule set up for that yet — I'll have the team follow up with a quote." };
      }

      const estimate = calculateEstimate(rule as PricingRule, { quantity: params.quantity, selections: params.selections ?? {} });
      return {
        result: `Based on what you've described, that would run roughly $${estimate.low} to $${estimate.high}. This is an estimate — a final price is confirmed after an on-site visit.`,
        estimate
      };
    }

    case 'check_availability': {
      const { data: conn } = await supabase.from('calendar_connections').select('*').eq('business_id', businessId).single();
      if (!conn) return { result: "I'm not able to check the calendar right now — I'll have someone reach out to schedule." };

      const busy = await getFreeBusy(conn.access_token, conn.refresh_token, conn.calendar_id, params.window_start, params.window_end);
      return { result: busy.length === 0 ? 'available' : 'has_conflicts', busy };
    }

    case 'save_lead': {
      const { data: lead, error } = await supabase
        .from('leads')
        .insert({
          business_id: businessId,
          call_id: ctx.mode === 'live' ? ctx.callId : null,
          is_practice: ctx.mode === 'practice',
          practice_session_id: ctx.mode === 'practice' ? ctx.practiceSessionId : null,
          name: params.name,
          phone: params.phone,
          email: params.email,
          address: params.address,
          project_details: params.project_details ?? {},
          status: 'new'
        })
        .select()
        .single();

      if (error) return { result: 'Failed to save lead.' };
      return { result: 'lead_saved', lead_id: lead.id };
    }

    case 'book_appointment': {
      const employeeSettings = await getAiEmployeeSettings(supabase, businessId);
      if (!employeeSettings.can_book_appointments) {
        return { result: "I'm not able to book appointments directly — I'll have someone reach out to schedule." };
      }

      const { data: business } = await supabase.from('businesses').select('name, timezone').eq('id', businessId).single();

      let calendarEventId: string | undefined;
      let suppressedAction: string | undefined;

      if (ctx.mode === 'live') {
        const { data: conn } = await supabase.from('calendar_connections').select('*').eq('business_id', businessId).single();
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
      } else {
        suppressedAction = `would have created a real calendar event for "${params.appointment_type ?? 'Estimate visit'} — ${params.name}" at ${params.readable_time ?? params.start_iso}`;
      }

      const { data: appt, error } = await supabase
        .from('appointments')
        .insert({
          business_id: businessId,
          lead_id: params.lead_id,
          calendar_event_id: calendarEventId,
          scheduled_at: params.start_iso,
          appointment_type: params.appointment_type ?? 'estimate_visit',
          status: 'scheduled',
          is_practice: ctx.mode === 'practice',
          practice_session_id: ctx.mode === 'practice' ? ctx.practiceSessionId : null
        })
        .select()
        .single();

      if (error) return { result: 'Failed to book appointment.' };

      if (params.phone) {
        if (ctx.mode === 'live') {
          const smsResult = await sendSms(
            params.phone,
            appointmentConfirmationSms({ businessName: business?.name ?? 'Your service provider', when: params.readable_time ?? params.start_iso, address: params.address })
          );
          if (smsResult.ok) await supabase.from('appointments').update({ confirmation_sent: true }).eq('id', appt.id);
        } else {
          suppressedAction = `${suppressedAction ?? ''}; would have texted a confirmation SMS to ${params.phone}`.replace(/^; /, '');
        }
      }

      return {
        result: 'appointment_booked',
        appointment_id: appt.id,
        ...(suppressedAction ? { suppressed_action: suppressedAction } : {})
      };
    }

    case 'transfer_call': {
      if (ctx.mode !== 'live') {
        const employeeSettings = await getAiEmployeeSettings(supabase, businessId);
        const destination = employeeSettings.escalation_phone_number ?? '(no escalation number configured)';
        return {
          result: `Ava would transfer this call to ${destination} — reason: ${params.reason ?? 'not specified'}.`,
          suppressed_action: `would have transferred the call to ${destination}`
        };
      }

      const employeeSettings = await getAiEmployeeSettings(supabase, businessId);

      // Log as a knowledge gap only when this is a real "I was missing
      // information" escalation, not a plain "let me speak to a person"
      // request (the latter is filtered out by isHumanHandoffRequest,
      // exactly as it already is in lib/rag.ts's gap logging).
      if (params.reason && !isHumanHandoffRequest(params.reason)) {
        await recordKnowledgeGap({
          businessId,
          question: params.reason,
          callId: ctx.callId,
          source: ctx.mode,
          practiceSessionId: ctx.practiceSessionId,
          reason: 'transfer_requested'
        });
      }

      return {
        result: 'transferring',
        transferTo: employeeSettings.escalation_phone_number || process.env.TWILIO_PHONE_NUMBER
      };
    }

    // ===================== Restaurant ordering =====================

    case 'find_menu_item': {
      const { data: items, error } = await supabase
        .from('menu_items')
        .select('id, name, description, base_price, sold_out, menu_item_sizes(id, label, price), menu_modifier_groups(id, name, selection_type, required, menu_modifier_options(id, label, price_delta))')
        .eq('business_id', businessId)
        .ilike('name', `%${params.query}%`)
        .limit(5);

      if (error) return { result: 'Could not search the menu right now.' };
      if (!items || items.length === 0) return { result: 'no_match', matches: [] };
      return { result: 'found', matches: items };
    }

    case 'add_order_item': {
      const employeeSettings = await getAiEmployeeSettings(supabase, businessId);
      if (!employeeSettings.can_take_orders) {
        return { result: "I'm not able to take orders over the phone right now — let me have someone assist you." };
      }

      let order = await getActiveOrder(supabase, ctx);

      if (!order) {
        const { data: newOrder, error: createError } = await supabase
          .from('orders')
          .insert({
            business_id: businessId,
            call_id: ctx.mode === 'live' ? ctx.callId : null,
            is_practice: ctx.mode === 'practice',
            practice_session_id: ctx.mode === 'practice' ? ctx.practiceSessionId : null,
            order_type: params.order_type === 'delivery' ? 'delivery' : 'pickup',
            status: 'draft'
          })
          .select()
          .single();
        if (createError || !newOrder) return { result: 'Could not start the order.' };
        order = newOrder;
      }

      const { data: menuItem } = await supabase
        .from('menu_items')
        .select('id, name, base_price, sold_out, menu_item_sizes(label, price)')
        .eq('business_id', businessId)
        .ilike('name', `%${params.menu_item_name}%`)
        .limit(1)
        .maybeSingle();

      if (!menuItem) return { result: `Couldn't find "${params.menu_item_name}" on the menu.` };
      if (menuItem.sold_out) return { result: `${menuItem.name} is sold out right now — want something else instead?` };

      let unitPrice = Number(menuItem.base_price);
      if (params.size_label) {
        const sizeMatch = (menuItem.menu_item_sizes as any[])?.find((s) => s.label.toLowerCase() === String(params.size_label).toLowerCase());
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

      if (itemInsertError) return { result: 'Could not add that item.' };
      return { result: 'item_added', order_id: order.id, item: itemInput.name_snapshot, line_total };
    }

    case 'remove_order_item': {
      const order = await getActiveOrder(supabase, ctx);
      if (!order) return { result: 'No active order to remove from.' };

      const { data: match } = await supabase
        .from('order_items')
        .select('id, name_snapshot')
        .eq('order_id', order.id)
        .ilike('name_snapshot', `%${params.item_description}%`)
        .limit(1)
        .maybeSingle();

      if (!match) return { result: `Couldn't find "${params.item_description}" in the order.` };

      await supabase.from('order_items').delete().eq('id', match.id);
      return { result: 'item_removed', item: match.name_snapshot };
    }

    case 'get_order_summary': {
      const employeeSettings = await getAiEmployeeSettings(supabase, businessId);
      const order = await getActiveOrder(supabase, ctx);
      if (!order || !order.order_items?.length) return { result: 'No items in the order yet.' };

      const { data: settings } = await supabase
        .from('restaurant_settings')
        .select('tax_rate, delivery_fee, discount_code, discount_percent')
        .eq('business_id', businessId)
        .single();

      const totals = computeOrderTotals({
        items: order.order_items,
        orderType: order.order_type,
        discountCode: employeeSettings.can_offer_discounts ? params.discount_code : undefined,
        settings: settings ?? { tax_rate: 0, delivery_fee: 0, discount_code: null, discount_percent: null }
      });

      await supabase
        .from('orders')
        .update({ status: 'pending_confirmation', subtotal: totals.subtotal, tax: totals.tax, delivery_fee: totals.deliveryFee, discount: totals.discount, total: totals.total })
        .eq('id', order.id);

      const itemLines = order.order_items.map((i: any) => `${i.quantity} ${i.name_snapshot}${i.size_label ? ` (${i.size_label})` : ''}`).join(', ');

      return {
        result: `Your order includes ${itemLines}. Subtotal $${totals.subtotal.toFixed(2)}, tax $${totals.tax.toFixed(2)}${
          totals.deliveryFee ? `, delivery fee $${totals.deliveryFee.toFixed(2)}` : ''
        }${totals.discount ? `, discount -$${totals.discount.toFixed(2)}` : ''}. Total: $${totals.total.toFixed(2)}. Would you like to change anything?`,
        totals
      };
    }

    case 'confirm_order': {
      const employeeSettings = await getAiEmployeeSettings(supabase, businessId);
      const order = await getActiveOrder(supabase, ctx);
      if (!order || !order.order_items?.length) return { result: 'There is no order to confirm yet.' };

      if (ctx.mode === 'live') await releaseExpiredHolds(businessId);

      const { data: settings } = await supabase
        .from('restaurant_settings')
        .select('tax_rate, delivery_fee, discount_code, discount_percent, pay_at_pickup, pay_at_delivery')
        .eq('business_id', businessId)
        .single();

      const totals = computeOrderTotals({
        items: order.order_items,
        orderType: order.order_type,
        tipPercent: params.tip_percent,
        discountCode: employeeSettings.can_offer_discounts ? params.discount_code : undefined,
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
        return {
          result: `You're all set — total is $${totals.total.toFixed(2)}, due when your order is ${order.order_type === 'pickup' ? 'picked up' : 'delivered'}. The restaurant has your order now.`
        };
      }

      if (ctx.mode !== 'live') {
        await supabase.from('orders').update({ status: 'pending_payment' }).eq('id', order.id);
        return {
          result: `Your total is $${totals.total.toFixed(2)}. In a real call, I'd text a secure payment link to ${params.customer_phone} now and the order would go to the kitchen once payment completes — practice mode skips the real text and the real Stripe charge.`,
          suppressed_action: `would have texted a Stripe payment link for $${totals.total.toFixed(2)} to ${params.customer_phone}`
        };
      }

      const link = await createOrderPaymentLink(order.id);
      if ('error' in link) {
        return { result: "I've got your order, but I'm having trouble generating the payment link — someone from the restaurant will follow up." };
      }

      // Never claim the text went out until Twilio actually confirms it —
      // sendSms()'s result must be checked, not assumed, before Ava says
      // "I've texted you" (the same discipline book_appointment already
      // applies to its own confirmation SMS a few cases above).
      let smsSent = false;
      if (params.customer_phone) {
        const smsResult = await sendSms(params.customer_phone, `Your order total is $${totals.total.toFixed(2)}. Pay here to confirm: ${link.url}`);
        smsSent = smsResult.ok;
        if (!smsResult.ok) {
          logger.error('order_payment_sms_failed', { orderId: order.id, businessId, message: smsResult.error });
        }
      }

      return {
        result: smsSent
          ? `Your total is $${totals.total.toFixed(2)}. I've texted you a secure payment link — your order will be sent to the kitchen as soon as payment goes through.`
          : `Your total is $${totals.total.toFixed(2)}. I wasn't able to text you the payment link just now — I'll have the restaurant follow up with it directly, or I can read the link to you if that helps.`,
        payment_url: link.url
      };
    }

    default:
      return { result: `Unknown function: ${name}` };
  }
}
