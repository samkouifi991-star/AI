-- Backs the "Your phone" plain-sentence rules screen. call_routing_rules
-- already had a single mutually-exclusive `mode` plus a few standalone
-- booleans; the redesign treats call handling as several INDEPENDENTLY
-- toggleable rules (ring-then-AI, quiet-hours AI-only, transfer-on-
-- request, transfer-if-urgent, voicemail fallback) that can all be on at
-- once — a real telephony setup, not a single radio choice. The existing
-- `mode`-based columns and the /phone/routing full-form page are left
-- alone; these are additive columns the new toggles read and write.

alter table call_routing_rules add column if not exists ring_before_ai_enabled boolean not null default true;
alter table call_routing_rules add column if not exists quiet_hours_enabled boolean not null default false;
alter table call_routing_rules add column if not exists quiet_hours_start time;
alter table call_routing_rules add column if not exists quiet_hours_end time;
-- transfer_on_customer_request and voicemail_fallback_enabled already
-- exist (migration 0006) and are reused as-is for rules 3 and 5.
alter table call_routing_rules add column if not exists urgent_transfer_enabled boolean not null default true;
