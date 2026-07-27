export interface PricingRule {
  id: string;
  name: string;
  rule_type: 'per_unit' | 'flat' | 'tiered' | 'multiplier';
  unit_label?: string;
  base_rate: number;
  min_price?: number;
  max_price?: number;
  modifiers: Record<string, number>; // e.g. { gate: 150, removal_existing_fence: 3.5 }
}

export interface EstimateInput {
  quantity: number;                 // e.g. 200 (linear feet)
  selections: Record<string, number | boolean>; // e.g. { gates: 2, removal_existing_fence: true }
}

export interface EstimateResult {
  lineItems: { label: string; amount: number }[];
  low: number;
  high: number;
}

/**
 * Calculates a low/high estimate range from a pricing rule + the details the
 * AI collected on the call (quantity, gates, removal, terrain, etc.).
 * A +/-15% spread is applied around the point estimate since this is an
 * estimate, not a firm quote — matches the "clearly explain this is an
 * estimate" requirement from the spec.
 */
export function calculateEstimate(rule: PricingRule, input: EstimateInput): EstimateResult {
  const lineItems: { label: string; amount: number }[] = [];
  let subtotal = 0;

  if (rule.rule_type === 'flat') {
    subtotal = rule.base_rate;
    lineItems.push({ label: rule.name, amount: rule.base_rate });
  } else {
    // per_unit / tiered / multiplier all start from quantity * base_rate
    const base = rule.base_rate * input.quantity;
    subtotal += base;
    lineItems.push({
      label: `${rule.name} (${input.quantity} ${rule.unit_label ?? 'units'} × $${rule.base_rate})`,
      amount: base
    });
  }

  for (const [key, value] of Object.entries(input.selections)) {
    const modifierRate = rule.modifiers[key];
    if (modifierRate === undefined) continue;

    if (typeof value === 'boolean' && value) {
      const amount = modifierRate * input.quantity;
      subtotal += amount;
      lineItems.push({ label: `${key.replace(/_/g, ' ')}`, amount });
    } else if (typeof value === 'number' && value > 0) {
      const amount = modifierRate * value;
      subtotal += amount;
      lineItems.push({ label: `${key.replace(/_/g, ' ')} (x${value})`, amount });
    }
  }

  let low = subtotal * 0.85;
  let high = subtotal * 1.15;

  if (rule.min_price) low = Math.max(low, rule.min_price);
  if (rule.max_price) high = Math.min(high, rule.max_price);

  return { lineItems, low: Math.round(low), high: Math.round(high) };
}
