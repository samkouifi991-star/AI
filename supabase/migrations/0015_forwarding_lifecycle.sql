-- Call-forwarding lifecycle: tracking whether forwarding is currently
-- active (separate from whether it was ever verified working), and the
-- carrier codes needed to cancel conditional (busy/no-answer) forwarding,
-- not just unconditional forwarding.

alter table forwarding_setups add column if not exists forwarding_active boolean not null default true;
alter table forwarding_setups add column if not exists disabled_at timestamptz;
-- Disabling forwarding can only ever be established by the customer's own
-- report (there is no server-observable signal for "a call did NOT get
-- forwarded") — this column exists so the UI can be honest that this
-- particular status is self-reported, not independently verified the way
-- last_test_status (forwarding ON) is.
alter table forwarding_setups add column if not exists disabled_confirmed_by_customer boolean not null default false;

alter table carrier_forwarding_codes add column if not exists forward_busy_cancel_code text;
alter table carrier_forwarding_codes add column if not exists forward_no_answer_cancel_code text;

-- AT&T and T-Mobile are GSM-standard carriers in the US and use the
-- published 3GPP/GSM MMI supplementary-service codes for conditional call
-- forwarding — #67# and #61# are the standard deactivation codes for
-- "forward on busy" and "forward on no answer" respectively, independent
-- of carrier. Verizon (CDMA) does not publish an equivalent code for
-- deactivating conditional-only forwarding while leaving nothing else
-- changed, so that cell is intentionally left null rather than guessed —
-- the UI must fall back to "contact your carrier" whenever a code is null.
update carrier_forwarding_codes set forward_busy_cancel_code = '#67#', forward_no_answer_cancel_code = '#61#' where carrier = 'att';
update carrier_forwarding_codes set forward_busy_cancel_code = '##67#', forward_no_answer_cancel_code = '##61#' where carrier = 'tmobile';
