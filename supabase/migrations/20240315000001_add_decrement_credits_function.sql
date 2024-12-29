create or replace function decrement_credits(p_user_id uuid, p_amount int)
returns int
language plpgsql
security definer
as $$
declare
  v_rows_affected int;
begin
  with updated as (
    update subscriptions
    set credits = credits - p_amount
    where user_id = p_user_id
    and status in ('trialing', 'active')
    and credits >= p_amount
    returning id
  )
  select count(*) into v_rows_affected from updated;

  return v_rows_affected;
end;
$$; 