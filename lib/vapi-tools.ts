/**
 * Canonical Vapi function/tool definitions for the Business Pilot AI
 * receptionist assistant. Every name here has a matching handler in
 * app/api/vapi/webhook/route.ts — this is what actually lets Ava call
 * get_business_knowledge, look up menu items, place orders, book
 * appointments, and transfer calls, instead of just talking with no tools.
 *
 * Previously this list only existed in vapi-assistant-config.example.json
 * as documentation; lib/vapi-assistant.ts's createAssistant() never sent
 * it to Vapi, so real provisioned assistants had no tools at all.
 */
export const VAPI_TOOLS = [
  {
    name: 'get_business_knowledge',
    description: "Look up an answer from this business's knowledge base (FAQs, policies, service details).",
    parameters: {
      type: 'object',
      properties: { question: { type: 'string' } },
      required: ['question']
    }
  },
  {
    name: 'calculate_estimate',
    description: "Calculate a price estimate range using the business's pricing rules.",
    parameters: {
      type: 'object',
      properties: {
        pricing_rule_id: { type: 'string' },
        quantity: { type: 'number' },
        selections: { type: 'object', description: 'e.g. { gates: 2, removal_existing_fence: true }' }
      },
      required: ['pricing_rule_id', 'quantity']
    }
  },
  {
    name: 'check_availability',
    description: 'Check calendar availability within a time window.',
    parameters: {
      type: 'object',
      properties: {
        window_start: { type: 'string', description: 'ISO 8601' },
        window_end: { type: 'string', description: 'ISO 8601' }
      },
      required: ['window_start', 'window_end']
    }
  },
  {
    name: 'save_lead',
    description: "Save the customer's contact and project info as a lead.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        project_details: { type: 'object' }
      },
      required: ['name', 'phone']
    }
  },
  {
    name: 'book_appointment',
    description: "Book an appointment on the business's calendar and send a confirmation.",
    parameters: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        start_iso: { type: 'string' },
        end_iso: { type: 'string' },
        readable_time: { type: 'string' },
        appointment_type: { type: 'string', enum: ['estimate_visit', 'service_call'] },
        notes: { type: 'string' }
      },
      required: ['name', 'phone', 'start_iso', 'end_iso']
    }
  },
  {
    name: 'detect_language',
    description: "Check what language the caller is speaking, using their most recent utterance. Only useful if the business has auto-detect enabled.",
    parameters: {
      type: 'object',
      properties: { utterance: { type: 'string', description: "The caller's most recent sentence, verbatim" } },
      required: ['utterance']
    }
  },
  {
    name: 'switch_language',
    description: 'Switch the active language for the rest of the call. Call this after the caller has confirmed, if confirmation was required.',
    parameters: {
      type: 'object',
      properties: {
        target_language: { type: 'string', description: "ISO 639-1 code, e.g. 'es'" },
        confirmed: { type: 'boolean', description: 'true if the caller explicitly agreed to switch' }
      },
      required: ['target_language', 'confirmed']
    }
  },
  {
    name: 'find_menu_item',
    description: "Search the restaurant's published menu for an item by name. Use this before adding anything to an order, so you know its real price, available sizes, and modifiers/add-ons to ask about.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The item name or partial name the customer mentioned' } },
      required: ['query']
    }
  },
  {
    name: 'add_order_item',
    description: 'Add one item to the customer’s in-progress order, once you know the item, size (if applicable), and any modifiers they want.',
    parameters: {
      type: 'object',
      properties: {
        order_type: { type: 'string', enum: ['pickup', 'delivery'] },
        menu_item_name: { type: 'string' },
        size_label: { type: 'string', description: 'Must match one of the sizes returned by find_menu_item, if the item has sizes' },
        modifiers: {
          type: 'array',
          items: { type: 'object', properties: { label: { type: 'string' }, price_delta: { type: 'number' } } }
        },
        quantity: { type: 'number' },
        special_instructions: { type: 'string' }
      },
      required: ['order_type', 'menu_item_name']
    }
  },
  {
    name: 'remove_order_item',
    description: 'Remove an item from the in-progress order, e.g. if the customer changes their mind before confirming.',
    parameters: {
      type: 'object',
      properties: { item_description: { type: 'string', description: 'Name of the item to remove, as it was ordered' } },
      required: ['item_description']
    }
  },
  {
    name: 'get_order_summary',
    description: 'Get the full itemized order with subtotal, tax, delivery fee, discount, and total — use this to repeat the order back to the customer before finalizing.',
    parameters: {
      type: 'object',
      properties: { discount_code: { type: 'string', description: 'Only if the customer mentions a promo/discount code' } }
    }
  },
  {
    name: 'confirm_order',
    description: "Finalize the order once the customer confirms there's nothing else to change. Generates a Stripe payment link (unless the restaurant allows pay-at-pickup/delivery) and texts it to the customer.",
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        customer_phone: { type: 'string' },
        customer_email: { type: 'string' },
        tip_percent: { type: 'number' },
        discount_code: { type: 'string' }
      },
      required: ['customer_name', 'customer_phone']
    }
  },
  {
    name: 'transfer_call',
    description: 'Transfer the call to a real person for anything urgent, complicated, or outside scope.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason']
    }
  }
] as const;

// Practice mode is text-only rehearsal, not a real phone call — language
// detection/switching is a call-audio concept that doesn't apply.
export const PRACTICE_TOOLS = VAPI_TOOLS.filter((t) => t.name !== 'detect_language' && t.name !== 'switch_language');

/** Converts Vapi's function-list shape into OpenAI chat.completions' tools shape. */
export function toOpenAiChatTools(tools: readonly { name: string; description: string; parameters: Record<string, unknown> }[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));
}

export interface RoutingPromptRules {
  transferOnCustomerRequest?: boolean;
  urgentTransferEnabled?: boolean;
  voicemailFallbackEnabled?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string | null; // 'HH:MM', 24h
  quietHoursEnd?: string | null;
}

/**
 * Builds the system prompt Ava actually runs on for a given business.
 * Restaurant businesses get the ordering-flow instructions; service
 * businesses get the estimate/appointment flow. Both variants share the
 * same "never invent" contract.
 *
 * `routing` is the business's real call_routing_rules — the "Your phone"
 * page's plain-sentence toggles (see migration 0017) genuinely change
 * this prompt, not just what's displayed in the dashboard. Omitting it
 * keeps the previous defaults (always transfer on request/urgent, offer
 * voicemail) so callers of buildSystemPrompt that don't yet have routing
 * rules loaded (e.g. at first assistant creation) see unchanged behavior.
 */
export function buildSystemPrompt(
  business: { name: string; business_type?: string | null; service_area?: string | null },
  routing?: RoutingPromptRules
): string {
  const isRestaurant = business.business_type === 'restaurant';
  const areaClause = business.service_area ? ` serving ${business.service_area}` : '';

  const transferOnRequest = routing?.transferOnCustomerRequest ?? true;
  const urgentTransfer = routing?.urgentTransferEnabled ?? true;
  const voicemailFallback = routing?.voicemailFallbackEnabled ?? true;

  const transferClause = [
    transferOnRequest ? 'if the caller directly asks to speak with a person, call transfer_call' : 'do not transfer just because the caller asks for a person — try to help them yourself, or say someone will follow up',
    urgentTransfer ? 'call transfer_call immediately for anything urgent or upset' : null
  ]
    .filter(Boolean)
    .join(', and ');

  const voicemailClause = voicemailFallback
    ? ' If you cannot help and transferring is not appropriate or no one answers, offer to take a message and let the caller know it will be passed along.'
    : '';

  const quietHoursClause =
    routing?.quietHoursEnabled && routing.quietHoursStart && routing.quietHoursEnd
      ? ` During quiet hours (between ${routing.quietHoursStart} and ${routing.quietHoursEnd}), handle every call yourself — the owner will not be rung or notified in real time regardless of the rules above.`
      : '';

  const shared = `You are the virtual receptionist for ${business.name}, a ${isRestaurant ? 'restaurant' : 'business'}${areaClause}. Your job: (1) understand why the customer is calling, (2) answer questions using ONLY the get_business_knowledge tool — never guess prices or policies, (6) call save_lead as soon as you have enough info, even if they don't book, (7) ${transferClause} or for anything outside what you can help with.${voicemailClause}${quietHoursClause} LANGUAGE: if auto-detect is enabled for this business, call detect_language early in the call and whenever the caller's language seems to have changed. If detect_language returns confirm_required, ask the caller the provided message_to_customer and wait for their answer, then call switch_language with confirmed true or false based on their response — never switch language without asking first when confirmation is required. Always speak your replies, including get_business_knowledge answers, in the call's current active language.`;

  const restaurantFlow = ` RESTAURANT ORDERING: ask pickup or delivery early, then use find_menu_item before adding anything so you know real prices/sizes/modifiers — never invent a menu item or price. Ask about sizes, toppings, and add-ons when the item has them. If an item isn't found or is sold out, say so honestly — never claim it's available. If a required modifier is missing, ask for it before adding the item. Use add_order_item for each item and remove_order_item if the customer changes their mind, or if they change quantity, remove and re-add with the new quantity. When they're done ordering, call get_order_summary and read the full breakdown back to them — stating the correct total — then ask if they'd like to change anything — keep looping add/remove until they confirm. Only then call confirm_order, which texts the payment link; tell them the order goes to the kitchen once payment completes, unless the restaurant allows pay-at-pickup/delivery, in which case say the order is placed and payment is due then instead. Never say an order was placed unless confirm_order actually succeeded.`;

  const serviceFlow = ` (3) if pricing is allowed, gather the details required by the relevant pricing rule and call calculate_estimate, always stating clearly that it's an estimate, not a final price, (4) check_availability and book_appointment when the customer wants to schedule. Never say an appointment is booked unless book_appointment actually succeeded.`;

  return `${shared}${isRestaurant ? restaurantFlow : serviceFlow} Be warm, concise, and never make up information — if you don't know something and get_business_knowledge has no answer, say so and offer to transfer or have someone follow up.`;
}
