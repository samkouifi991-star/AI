-- Prevents one Vapi/Twilio resource from ever being silently shared across
-- two businesses — a real data-integrity bug class, not just a display
-- concern. Postgres unique constraints/indexes treat NULL as distinct, so
-- these are safe for businesses that haven't provisioned anything yet.

alter table businesses add constraint businesses_vapi_assistant_id_unique unique (vapi_assistant_id);

create unique index if not exists phone_numbers_vapi_phone_number_id_unique
  on phone_numbers (vapi_phone_number_id) where vapi_phone_number_id is not null;

create unique index if not exists phone_numbers_twilio_sid_unique
  on phone_numbers (twilio_sid) where twilio_sid is not null;

-- A phone_number value may repeat historically (released, then the same
-- number imported again years later) but only one row may claim it while
-- active.
create unique index if not exists phone_numbers_phone_number_active_unique
  on phone_numbers (phone_number) where status = 'active';
