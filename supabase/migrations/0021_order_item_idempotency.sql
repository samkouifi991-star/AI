-- Reliability Phase 0, item 4 — a repeated add_order_item tool call must
-- not add the same item twice.
--
-- Voice function-calling doesn't give the model a stable id it reliably
-- resends unchanged on a retry, so client_request_id is computed
-- server-side from the request's own content plus a coarse time bucket
-- (see lib/ava-dispatcher.ts) rather than supplied by the model — narrow
-- enough that a customer genuinely re-ordering the same item minutes
-- later gets a new key, wide enough to catch a rapid re-ask of the same
-- request moments after the first one.

alter table order_items add column if not exists client_request_id text;

create unique index if not exists order_items_client_request_id_unique
  on order_items (order_id, client_request_id) where client_request_id is not null;
