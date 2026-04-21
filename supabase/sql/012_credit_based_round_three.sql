-- Migration 012: Update Round 3 qualification logic to rank by total player credit scores

-- Replace start_round_three to use credit scoring instead of spent amount
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

  -- Reset all teams
  update public.teams
  set round3_qualified = false,
      updated_at = now()
  where true;

  -- Qualify top 5 teams by total credit points
  update public.teams t
  set round3_qualified = true,
      updated_at = now()
  where t.franchise_code in (
    select q.franchise_code
    from (
      select
        t.franchise_code,
        coalesce(sum(p.credit_points), 0) as total_credits,
        row_number() over (
          order by coalesce(sum(p.credit_points), 0) desc, t.franchise_code asc
        ) as ranking_position
      from public.teams t
      left join public.players p
        on p.assigned_franchise_code = t.franchise_code
        and p.assigned_franchise_code is not null
      group by t.franchise_code
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

  -- Recalculate team stats for qualified teams (only strategy picks remain)
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

  -- Reset non-qualified teams
  update public.teams
  set roster_count = 0,
      spent_lakhs = 0,
      purse_lakhs = 10000,
      updated_at = now()
  where round3_qualified = false;

  -- Update auction state
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

-- Create a view for team rankings by credit score
create or replace view public.team_credit_rankings as
select
  t.franchise_code,
  t.name,
  coalesce(sum(p.credit_points), 0) as total_credits,
  count(case when p.id is not null then 1 end) as player_count,
  t.spent_lakhs,
  greatest(10000 - t.spent_lakhs, 0) as remaining_budget,
  t.round3_qualified,
  row_number() over (order by coalesce(sum(p.credit_points), 0) desc, t.franchise_code asc) as ranking
from public.teams t
left join public.players p
  on p.assigned_franchise_code = t.franchise_code
  and p.assigned_franchise_code is not null
group by t.franchise_code, t.name, t.spent_lakhs, t.round3_qualified
order by total_credits desc;
