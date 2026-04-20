begin;

-- Global auction configuration:
-- team purse cap = 100 Cr (10,000 lakhs), team size cap = 11 players.
update public.teams
set
  spent_lakhs = least(greatest(coalesce(spent_lakhs, 0), 0), 10000),
  roster_count = least(greatest(coalesce(roster_count, 0), 0), 11),
  purse_lakhs = greatest(10000 - least(greatest(coalesce(spent_lakhs, 0), 0), 10000), 0),
  updated_at = now();

alter table public.teams
  alter column purse_lakhs set default 10000;

alter table public.teams
  drop constraint if exists teams_purse_lakhs_range_check;
alter table public.teams
  add constraint teams_purse_lakhs_range_check check (purse_lakhs between 0 and 10000);

alter table public.teams
  drop constraint if exists teams_spent_lakhs_range_check;
alter table public.teams
  add constraint teams_spent_lakhs_range_check check (spent_lakhs between 0 and 10000);

alter table public.teams
  drop constraint if exists teams_roster_count_cap_check;
alter table public.teams
  add constraint teams_roster_count_cap_check check (roster_count between 0 and 11);

create or replace function public.lock_player_to_franchise(
  p_player_id uuid,
  p_franchise_code text,
  p_bid_lakhs integer default null
)
returns public.players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.players;
  v_final_bid integer;
  v_team public.teams;
begin
  if not public.is_admin_user() then
    raise exception 'Unauthorized';
  end if;

  select * into v_player
  from public.players
  where id = p_player_id
  for update;

  if v_player.id is null then
    raise exception 'Player not found';
  end if;

  if v_player.assigned_franchise_code is not null then
    raise exception 'Player is already assigned';
  end if;

  v_final_bid := coalesce(p_bid_lakhs, v_player.current_bid_lakhs, v_player.base_price_lakhs);

  if v_final_bid <= 0 then
    raise exception 'Final bid must be greater than 0';
  end if;

  select * into v_team
  from public.teams
  where franchise_code = p_franchise_code
  for update;

  if v_team.id is null then
    raise exception 'Team not found';
  end if;

  if v_team.is_blocked then
    raise exception 'Team is blocked';
  end if;

  if v_team.roster_count >= 11 then
    raise exception 'Squad full. Maximum 11 players allowed.';
  end if;

  if v_team.purse_lakhs <= 0 then
    raise exception 'You have exhausted your funds. Go back and manage your team.';
  end if;

  if v_final_bid > v_team.purse_lakhs then
    raise exception 'Insufficient purse for this bid';
  end if;

  update public.players
    set assigned_franchise_code = p_franchise_code,
        last_bidder_code = p_franchise_code,
        current_bid_lakhs = v_final_bid,
        auction_status = 'sold',
        assigned_at = now(),
        updated_at = now()
  where id = p_player_id
  returning * into v_player;

  update public.teams
    set roster_count = roster_count + 1,
        spent_lakhs = spent_lakhs + v_final_bid,
        purse_lakhs = greatest(purse_lakhs - v_final_bid, 0),
        updated_at = now()
  where franchise_code = p_franchise_code;

  update public.auction_state
    set current_player_id = public.get_next_available_player_id(p_player_id),
        current_bid_lakhs = 0,
        current_winning_franchise_code = null,
        current_winning_bid_lakhs = 0,
        status = case when public.get_next_available_player_id(p_player_id) is null then 'stopped' else 'idle' end,
        updated_at = now()
  where id = (select id from public.auction_state order by created_at asc limit 1);

  return v_player;
end;
$$;

commit;
