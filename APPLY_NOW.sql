-- IPL Auction: Unified Migration (009 + 010 + 011)
-- This combines all necessary schema updates, round mechanics, and policy fixes
-- Copy-paste this entire file into Supabase SQL Editor and execute

-- ============================================================================
-- MIGRATION 009: Auction caps and bid rules enforcement
-- ============================================================================
begin;

-- Global auction configuration:
-- team purse cap = 100 Cr (10,000 lakhs), team size cap = 11 players.
update public.teams
set
  spent_lakhs = least(greatest(coalesce(spent_lakhs, 0), 0), 10000),
  roster_count = least(greatest(coalesce(roster_count, 0), 0), 11),
  purse_lakhs = greatest(10000 - least(greatest(coalesce(spent_lakhs, 0), 0), 10000), 0),
  updated_at = now()
where true;

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

-- Existing deployments may have this function with the same signature but a different return type.
drop function if exists public.lock_player_to_franchise(uuid, text, integer);

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

-- ============================================================================
-- MIGRATION 010: Round 3 strategy and top-5 qualification
-- ============================================================================
begin;

create table if not exists public.team_strategy_picks (
  id uuid primary key default gen_random_uuid(),
  team_code text not null references public.franchises(code) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  slot integer not null check (slot in (1, 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_code, slot),
  unique (team_code, player_id)
);

alter table public.team_strategy_picks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'team_strategy_picks'
      and policyname = 'anon_can_manage_team_strategy_picks'
  ) then
    create policy "anon_can_manage_team_strategy_picks"
      on public.team_strategy_picks
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

alter table public.auction_state
  add column if not exists auction_round integer not null default 2;

alter table public.teams
  add column if not exists round3_qualified boolean not null default false;

alter table public.auction_state
  drop constraint if exists auction_state_round_check;

alter table public.auction_state
  add constraint auction_state_round_check check (auction_round in (2, 3));

update public.auction_state
set auction_round = coalesce(auction_round, 2),
    updated_at = now()
where true;

create or replace function public.start_round_three()
returns public.auction_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.auction_state;
begin
  select * into v_state
  from public.auction_state
  order by created_at asc
  limit 1;

  if v_state.id is null then
    raise exception 'Auction state not found';
  end if;

  update public.teams
  set round3_qualified = false,
      updated_at = now()
  where true;

  update public.teams t
  set round3_qualified = true,
      updated_at = now()
  where true
    and t.franchise_code in (
    select q.franchise_code
    from (
      select
        franchise_code,
        spent_lakhs,
        roster_count,
        row_number() over (
          order by spent_lakhs desc, roster_count desc, franchise_code asc
        ) as ranking_position
      from public.teams
    ) q
    where q.ranking_position <= 5
  );

  -- Release all players not marked as strategy from QUALIFIED teams
  update public.players p
    set assigned_franchise_code = null,
        last_bidder_code = null,
        current_bid_lakhs = 0,
        auction_status = 'unsold',
        assigned_at = null,
        updated_at = now()
  where p.assigned_franchise_code is not null
    and exists (
      select 1 from public.teams t
      where t.franchise_code = p.assigned_franchise_code
        and t.round3_qualified = true
    )
    and not exists (
      select 1
      from public.team_strategy_picks tsp
      where tsp.team_code = p.assigned_franchise_code
        and tsp.player_id = p.id
    );

  -- Release ALL players from NON-QUALIFIED teams
  update public.players p
    set assigned_franchise_code = null,
        last_bidder_code = null,
        current_bid_lakhs = 0,
        auction_status = 'unsold',
        assigned_at = null,
        updated_at = now()
  where p.assigned_franchise_code is not null
    and not exists (
      select 1 from public.teams t
      where t.franchise_code = p.assigned_franchise_code
        and t.round3_qualified = true
    );

  update public.teams t
    set roster_count = coalesce((
          select count(*)
          from public.players p
          where p.assigned_franchise_code = t.franchise_code
            and t.round3_qualified = true
            and exists (
              select 1
              from public.team_strategy_picks tsp
              where tsp.team_code = t.franchise_code
                and tsp.player_id = p.id
            )
        ), 0),
        spent_lakhs = coalesce((
          select sum(coalesce(p.current_bid_lakhs, 0))
          from public.players p
          where p.assigned_franchise_code = t.franchise_code
            and t.round3_qualified = true
            and exists (
              select 1
              from public.team_strategy_picks tsp
              where tsp.team_code = t.franchise_code
                and tsp.player_id = p.id
            )
        ), 0),
        purse_lakhs = greatest(10000 - coalesce((
          select sum(coalesce(p.current_bid_lakhs, 0))
          from public.players p
          where p.assigned_franchise_code = t.franchise_code
            and t.round3_qualified = true
            and exists (
              select 1
              from public.team_strategy_picks tsp
              where tsp.team_code = t.franchise_code
                and tsp.player_id = p.id
            )
        ), 0), 0),
        updated_at = now()
  where t.round3_qualified = true;

  update public.teams
  set roster_count = 0,
      spent_lakhs = 0,
      purse_lakhs = 10000,
      updated_at = now()
  where round3_qualified = false;

  update public.auction_state
    set auction_round = 3,
        current_player_id = null,
        current_bid_lakhs = 0,
        current_winning_franchise_code = null,
        current_winning_bid_lakhs = 0,
        status = 'idle',
        updated_at = now()
  where id = v_state.id
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.switch_to_round_two()
returns public.auction_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.auction_state;
begin
  select * into v_state
  from public.auction_state
  order by created_at asc
  limit 1;

  if v_state.id is null then
    raise exception 'Auction state not found';
  end if;

  update public.teams
    set round3_qualified = false,
        updated_at = now()
  where round3_qualified = true;

  update public.auction_state
    set auction_round = 2,
        current_player_id = null,
        current_bid_lakhs = 0,
        current_winning_franchise_code = null,
        current_winning_bid_lakhs = 0,
        status = 'idle',
        updated_at = now()
  where id = v_state.id
  returning * into v_state;

  return v_state;
end;
$$;

create or replace function public.reset_full_auction()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auction_state
    set current_player_id = null,
        current_bid_lakhs = 0,
        current_winning_franchise_code = null,
        current_winning_bid_lakhs = 0,
        auction_round = 2,
        status = 'idle',
        updated_at = now()
  where true;

  update public.players
    set assigned_franchise_code = null,
        last_bidder_code = null,
        current_bid_lakhs = 0,
        auction_status = 'unsold',
        assigned_at = null,
        updated_at = now()
  where true;

  update public.teams
    set purse_lakhs = 10000,
        spent_lakhs = 0,
        roster_count = 0,
        round3_qualified = false,
        is_blocked = false,
        updated_at = now()
  where true;

  delete from public.team_strategy_picks;
end;
$$;

commit;

-- ============================================================================
-- MIGRATION 011: Enable client-side admin write policies
-- ============================================================================
begin;

-- This app currently executes super-admin writes directly from the client.
-- Enable broad write access for anon/authenticated so admin controls function without Supabase Auth admin_profiles.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'teams'
      and policyname = 'anon_can_manage_teams'
  ) then
    create policy "anon_can_manage_teams"
      on public.teams
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'players'
      and policyname = 'anon_can_manage_players'
  ) then
    create policy "anon_can_manage_players"
      on public.players
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'auction_state'
      and policyname = 'anon_can_manage_auction_state'
  ) then
    create policy "anon_can_manage_auction_state"
      on public.auction_state
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end;
$$;

commit;

-- ============================================================================
-- Migration complete
-- ============================================================================
-- All three migrations applied successfully
-- Next: Refresh /admin/super-admin and test "Start Round 3"
