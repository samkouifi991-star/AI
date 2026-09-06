-- Reliability Phase 0, item 13 — create order (if needed) + add item +
-- recompute subtotal as one atomic operation, called via a single
-- .rpc(), so a partial order (an order row with no items because the
-- process died between the two separate inserts the old code made) is
-- structurally impossible rather than just unlikely.
--
-- The `for update` row lock on the find-or-create lookup is what closes
-- a real concurrency gap the old check-then-insert code had: two nearly
-- simultaneous add_order_item calls for the same brand-new call could
-- both see "no active order yet" and each create their own draft order,
-- splitting the customer's items across two orders. Locking the lookup
-- makes the second caller wait for the first to finish creating (or
-- finding) the order, then reuse that same row.

create or replace function add_order_item_tx(
  p_business_id uuid,
  p_call_id uuid,
  p_practice_session_id uuid,
  p_is_practice boolean,
  p_order_type text,
  p_menu_item_id uuid,
  p_name_snapshot text,
  p_size_label text,
  p_unit_price numeric,
  p_quantity int,
  p_modifiers jsonb,
  p_special_instructions text,
  p_line_total numeric,
  p_client_request_id text
) returns table(order_id uuid, item_id uuid, is_duplicate boolean) language plpgsql as $$
declare
  v_order_id uuid;
  v_item_id uuid;
  v_existing_item_id uuid;
begin
  if p_call_id is not null then
    select id into v_order_id from orders
      where call_id = p_call_id and status not in ('completed', 'cancelled', 'refunded')
      for update;
  elsif p_practice_session_id is not null then
    select id into v_order_id from orders
      where practice_session_id = p_practice_session_id and status not in ('completed', 'cancelled', 'refunded')
      for update;
  end if;

  if v_order_id is null then
    insert into orders (business_id, call_id, is_practice, practice_session_id, order_type, status)
    values (p_business_id, p_call_id, p_is_practice, p_practice_session_id, p_order_type, 'draft')
    returning id into v_order_id;
  end if;

  -- Idempotency (migration 0021): a duplicate client_request_id for this
  -- order means this exact item was already added moments ago — return
  -- the existing row rather than inserting, or erroring, again.
  select id into v_existing_item_id from order_items
    where order_items.order_id = v_order_id and order_items.client_request_id = p_client_request_id;

  if v_existing_item_id is not null then
    return query select v_order_id, v_existing_item_id, true;
    return;
  end if;

  insert into order_items (
    order_id, menu_item_id, name_snapshot, size_label, unit_price,
    quantity, modifiers, special_instructions, line_total, client_request_id
  )
  values (
    v_order_id, p_menu_item_id, p_name_snapshot, p_size_label, p_unit_price,
    p_quantity, p_modifiers, p_special_instructions, p_line_total, p_client_request_id
  )
  returning id into v_item_id;

  update orders
    set subtotal = (select coalesce(sum(line_total), 0) from order_items where order_items.order_id = v_order_id),
        updated_at = now()
    where id = v_order_id;

  return query select v_order_id, v_item_id, false;
end;
$$;
