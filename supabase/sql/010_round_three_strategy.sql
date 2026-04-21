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
