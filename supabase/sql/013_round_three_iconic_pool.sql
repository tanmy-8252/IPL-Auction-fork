-- Round 3 iconic pool metadata
-- Use these columns to keep Round 3-only players isolated from the normal Round 2 pool.

alter table public.players
  add column if not exists is_round_three_iconic boolean not null default false;

alter table public.players
  add column if not exists round_three_sequence integer;

alter table public.players
  add column if not exists available_from_round integer not null default 2;

alter table public.players
  drop constraint if exists players_available_from_round_check;

alter table public.players
  add constraint players_available_from_round_check
  check (available_from_round in (2, 3));

alter table public.players
  drop constraint if exists players_round_three_sequence_check;

alter table public.players
  add constraint players_round_three_sequence_check
  check (
    round_three_sequence is null
    or round_three_sequence > 0
  );

create index if not exists idx_players_round_three_iconic
  on public.players (is_round_three_iconic, round_three_sequence, sl_no);

-- Optional convenience view to verify your 30 iconic rows and sequence.
create or replace view public.round_three_iconic_players as
select
  id,
  sl_no,
  name,
  role,
  credit_points,
  is_round_three_iconic,
  available_from_round,
  round_three_sequence,
  assigned_franchise_code,
  auction_status
from public.players
where is_round_three_iconic = true
order by round_three_sequence nulls last, sl_no;
