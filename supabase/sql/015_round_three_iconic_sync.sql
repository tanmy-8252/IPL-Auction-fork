-- Round 3 iconic players: single editable sync script
-- Purpose:
-- 1) Insert missing iconic players
-- 2) Update existing iconic players
-- 3) Wire images as 1.A.png ... 30.A.png
--
-- HOW TO USE:
-- 1) Edit the rows CTE only (name/stats/image_file/sequence)
-- 2) Run this file in Supabase SQL editor
-- 3) Re-run anytime safely

-- Ensure required Round 3 metadata columns exist.
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

with rows(
  seq,
  name,
  role,
  status,
  base_price_lakhs,
  credit_points,
  matches_played,
  total_runs,
  batting_average,
  strike_rate,
  best_bowling,
  bowling_average,
  wickets_taken,
  economy,
  image_file
) as (
  values
    (1,  'VIRAT KOHLI',       'BATSMAN',       'DOMESTIC', 500, 200, 252, 8004, 38.67, 131.97, '2/25', 92.00,  4,  8.80, '1.A.png'),
    (2,  'ROHIT SHARMA',      'BATSMAN',       'DOMESTIC', 500, 196, 257, 6628, 29.72, 131.14, '4/6',  30.20, 15,  8.02, '2.A.png'),
    (3,  'SHREYAS IYER',      'BATSMAN',       'DOMESTIC', 500, 182, 115, 3127, 32.24, 127.48, '0',    0.00,   0,  7.00, '3.A.png'),
    (4,  'SHUBMAN GILL',      'BATSMAN',       'DOMESTIC', 500, 180, 103, 3088, 37.20, 135.20, '0',    0.00,   0,  0.00, '4.A.png'),
    (5,  'TRAVIS HEAD',       'BATSMAN',       'OVERSEAS', 500, 180,  25,  805, 36.59, 179.29, '1/11', 29.00,  2, 10.24, '5.A.png'),
    (6,  'MS DHONI',          'WICKET KEEPER', 'DOMESTIC', 500, 198, 264, 5243, 39.13, 137.54, '0',    0.00,   0,  0.00, '6.A.png'),
    (7,  'RISHABH PANT',      'WICKET KEEPER', 'DOMESTIC', 500, 182, 111, 3284, 35.31, 148.93, '0',    0.00,   0,  0.00, '7.A.png'),
    (8,  'JOS BUTTLER',       'WICKET KEEPER', 'OVERSEAS', 500, 192, 107, 3582, 38.11, 147.11, '0',    0.00,   0,  0.00, '8.A.png'),
    (9,  'KL RAHUL',          'WICKET KEEPER', 'DOMESTIC', 500, 190, 132, 4683, 45.47, 134.61, '0',    0.00,   0,  0.00, '9.A.png'),
    (10, 'ISHAN KISHAN',      'WICKET KEEPER', 'DOMESTIC', 500, 182, 105, 2644, 28.43, 135.87, '0',    0.00,   0,  0.00, '10.A.png'),
    (11, 'HARDIK PANDYA',     'ALL ROUNDER',   'DOMESTIC', 500, 195, 137, 2525, 30.06, 145.62, '3/17', 33.59, 64,  8.85, '11.A.png'),
    (12, 'RAVINDRA JADEJA',   'ALL ROUNDER',   'DOMESTIC', 500, 192, 240, 2959, 27.39, 129.72, '5/16', 30.41,160,  7.60, '12.A.png'),
    (13, 'ANDRE RUSSELL',     'ALL ROUNDER',   'OVERSEAS', 500, 195, 127, 2484, 29.22, 174.93, '5/15', 24.01,102,  9.24, '13.A.png'),
    (14, 'BEN STOKES',        'ALL ROUNDER',   'OVERSEAS', 500, 185,  45,  935, 24.61, 133.95, '3/15', 35.43, 28,  8.64, '14.A.png'),
    (15, 'SUNIL NARINE',      'ALL ROUNDER',   'OVERSEAS', 500, 185, 176, 1534, 17.04, 165.84, '5/19', 25.44,180,  6.73, '15.A.png'),
    (16, 'RASHID KHAN',       'ALL ROUNDER',   'OVERSEAS', 500, 194, 121,  545, 13.97, 158.43, '4/24', 21.82,149,  6.73, '16.A.png'),
    (17, 'AXAR PATEL',        'ALL ROUNDER',   'DOMESTIC', 500, 185, 150, 1653, 20.92, 130.88, '4/21', 30.55,123,  7.28, '17.A.png'),
    (18, 'KRUNAL PANDYA',     'ALL ROUNDER',   'DOMESTIC', 500, 187, 127, 1647, 21.39, 132.82, '3/14', 34.00, 76,  7.37, '18.A.png'),
    (19, 'MARCUS STONIS',     'ALL ROUNDER',   'OVERSEAS', 500, 178,  96, 1866, 28.27, 142.33, '4/40', 31.05, 43,  9.44, '19.A.png'),
    (20, 'TIM DAVID',         'ALL ROUNDER',   'OVERSEAS', 500, 175,  35,  658, 27.42, 170.91, '0',    0.00,   0, 13.50, '20.A.png'),
    (21, 'JASPRIT BUMRAH',    'PACER',         'DOMESTIC', 500, 197, 133,   64,  8.00,  91.43, '5/10', 22.51,165,  7.30, '21.A.png'),
    (22, 'BHUVNESHWAR KUMAR', 'PACER',         'DOMESTIC', 500, 195, 170,  284,  8.61,  92.22, '5/19', 27.23,181,  7.56, '22.A.png'),
    (23, 'MITCHELL STARC',    'PACER',         'OVERSEAS', 500, 192,  41,  114, 14.25,  98.00, '4/15', 23.94, 51,  8.21, '23.A.png'),
    (24, 'JOSH HAZLEWOOD',    'PACER',         'OVERSEAS', 500, 192,  30,   25, 25.00, 117.00, '4/25', 23.14, 39,  8.06, '24.A.png'),
    (25, 'TRENT BOULT',       'PACER',         'OVERSEAS', 500, 190, 101,  112, 10.18,  87.00, '4/18', 26.69,121,  8.29, '25.A.png'),
    (26, 'PAT CUMMINS',       'PACER',         'OVERSEAS', 500, 175,  58,  515, 18.39, 152.21, '4/34', 31.06, 63,  8.78, '26.A.png'),
    (27, 'MOHAMMAD SHAMI',    'PACER',         'DOMESTIC', 500, 173, 110,   79,  5.27, 102.60, '4/11', 26.74,127,  8.44, '27.A.png'),
    (28, 'JOFRA ARCHER',      'PACER',         'OVERSEAS', 500, 172,  40,  201, 15.46, 148.05, '3/15', 24.39, 48,  7.43, '28.A.png'),
    (29, 'KAGISO RABADA',     'PACER',         'OVERSEAS', 500, 170,  80,  204, 11.33, 105.15, '4/21', 21.05,117,  8.42, '29.A.png'),
    (30, 'ARSHDEEP SINGH',    'PACER',         'DOMESTIC', 500, 168,  65,   32,  4.57,  67.39, '5/32', 26.34, 76,  8.76, '30.A.png')
),
existing_max as (
  select coalesce(max(sl_no), 0) as max_sl_no
  from public.players
),
normalized as (
  select
    r.*,
    upper(regexp_replace(trim(r.name), '[^A-Za-z0-9]', '', 'g')) as name_key,
    row_number() over (order by r.seq) as ordinal
  from rows r
),
existing as (
  select
    p.id,
    upper(regexp_replace(trim(p.name), '[^A-Za-z0-9]', '', 'g')) as name_key
  from public.players p
),
missing as (
  select n.*
  from normalized n
  left join existing e on e.name_key = n.name_key
  where e.id is null
)
insert into public.players (
  sl_no,
  name,
  role,
  category,
  country,
  teams,
  image_url,
  base_price_lakhs,
  credit_points,
  matches_played,
  total_runs,
  batting_average,
  strike_rate,
  best_bowling,
  bowling_average,
  wickets_taken,
  economy,
  current_bid_lakhs,
  auction_status,
  is_round_three_iconic,
  available_from_round,
  round_three_sequence,
  created_at,
  updated_at
)
select
  em.max_sl_no + m.ordinal,
  m.name,
  m.role,
  case when upper(m.status) = 'OVERSEAS' then 'Overseas' else 'Domestic' end,
  m.status,
  '',
  m.image_file,
  m.base_price_lakhs,
  m.credit_points,
  m.matches_played,
  m.total_runs,
  m.batting_average,
  m.strike_rate,
  m.best_bowling,
  m.bowling_average,
  m.wickets_taken,
  m.economy,
  0,
  'unsold',
  true,
  3,
  m.seq,
  now(),
  now()
from missing m
cross join existing_max em;

-- Update existing + newly inserted rows with latest stats/image/flags
with rows(
  seq,
  name,
  role,
  status,
  base_price_lakhs,
  credit_points,
  matches_played,
  total_runs,
  batting_average,
  strike_rate,
  best_bowling,
  bowling_average,
  wickets_taken,
  economy,
  image_file
) as (
  values
    (1,  'VIRAT KOHLI',       'BATSMAN',       'DOMESTIC', 500, 200, 252, 8004, 38.67, 131.97, '2/25', 92.00,  4,  8.80, '1.A.png'),
    (2,  'ROHIT SHARMA',      'BATSMAN',       'DOMESTIC', 500, 196, 257, 6628, 29.72, 131.14, '4/6',  30.20, 15,  8.02, '2.A.png'),
    (3,  'SHREYAS IYER',      'BATSMAN',       'DOMESTIC', 500, 182, 115, 3127, 32.24, 127.48, '0',    0.00,   0,  7.00, '3.A.png'),
    (4,  'SHUBMAN GILL',      'BATSMAN',       'DOMESTIC', 500, 180, 103, 3088, 37.20, 135.20, '0',    0.00,   0,  0.00, '4.A.png'),
    (5,  'TRAVIS HEAD',       'BATSMAN',       'OVERSEAS', 500, 180,  25,  805, 36.59, 179.29, '1/11', 29.00,  2, 10.24, '5.A.png'),
    (6,  'MS DHONI',          'WICKET KEEPER', 'DOMESTIC', 500, 198, 264, 5243, 39.13, 137.54, '0',    0.00,   0,  0.00, '6.A.png'),
    (7,  'RISHABH PANT',      'WICKET KEEPER', 'DOMESTIC', 500, 182, 111, 3284, 35.31, 148.93, '0',    0.00,   0,  0.00, '7.A.png'),
    (8,  'JOS BUTTLER',       'WICKET KEEPER', 'OVERSEAS', 500, 192, 107, 3582, 38.11, 147.11, '0',    0.00,   0,  0.00, '8.A.png'),
    (9,  'KL RAHUL',          'WICKET KEEPER', 'DOMESTIC', 500, 190, 132, 4683, 45.47, 134.61, '0',    0.00,   0,  0.00, '9.A.png'),
    (10, 'ISHAN KISHAN',      'WICKET KEEPER', 'DOMESTIC', 500, 182, 105, 2644, 28.43, 135.87, '0',    0.00,   0,  0.00, '10.A.png'),
    (11, 'HARDIK PANDYA',     'ALL ROUNDER',   'DOMESTIC', 500, 195, 137, 2525, 30.06, 145.62, '3/17', 33.59, 64,  8.85, '11.A.png'),
    (12, 'RAVINDRA JADEJA',   'ALL ROUNDER',   'DOMESTIC', 500, 192, 240, 2959, 27.39, 129.72, '5/16', 30.41,160,  7.60, '12.A.png'),
    (13, 'ANDRE RUSSELL',     'ALL ROUNDER',   'OVERSEAS', 500, 195, 127, 2484, 29.22, 174.93, '5/15', 24.01,102,  9.24, '13.A.png'),
    (14, 'BEN STOKES',        'ALL ROUNDER',   'OVERSEAS', 500, 185,  45,  935, 24.61, 133.95, '3/15', 35.43, 28,  8.64, '14.A.png'),
    (15, 'SUNIL NARINE',      'ALL ROUNDER',   'OVERSEAS', 500, 185, 176, 1534, 17.04, 165.84, '5/19', 25.44,180,  6.73, '15.A.png'),
    (16, 'RASHID KHAN',       'ALL ROUNDER',   'OVERSEAS', 500, 194, 121,  545, 13.97, 158.43, '4/24', 21.82,149,  6.73, '16.A.png'),
    (17, 'AXAR PATEL',        'ALL ROUNDER',   'DOMESTIC', 500, 185, 150, 1653, 20.92, 130.88, '4/21', 30.55,123,  7.28, '17.A.png'),
    (18, 'KRUNAL PANDYA',     'ALL ROUNDER',   'DOMESTIC', 500, 187, 127, 1647, 21.39, 132.82, '3/14', 34.00, 76,  7.37, '18.A.png'),
    (19, 'MARCUS STONIS',     'ALL ROUNDER',   'OVERSEAS', 500, 178,  96, 1866, 28.27, 142.33, '4/40', 31.05, 43,  9.44, '19.A.png'),
    (20, 'TIM DAVID',         'ALL ROUNDER',   'OVERSEAS', 500, 175,  35,  658, 27.42, 170.91, '0',    0.00,   0, 13.50, '20.A.png'),
    (21, 'JASPRIT BUMRAH',    'PACER',         'DOMESTIC', 500, 197, 133,   64,  8.00,  91.43, '5/10', 22.51,165,  7.30, '21.A.png'),
    (22, 'BHUVNESHWAR KUMAR', 'PACER',         'DOMESTIC', 500, 195, 170,  284,  8.61,  92.22, '5/19', 27.23,181,  7.56, '22.A.png'),
    (23, 'MITCHELL STARC',    'PACER',         'OVERSEAS', 500, 192,  41,  114, 14.25,  98.00, '4/15', 23.94, 51,  8.21, '23.A.png'),
    (24, 'JOSH HAZLEWOOD',    'PACER',         'OVERSEAS', 500, 192,  30,   25, 25.00, 117.00, '4/25', 23.14, 39,  8.06, '24.A.png'),
    (25, 'TRENT BOULT',       'PACER',         'OVERSEAS', 500, 190, 101,  112, 10.18,  87.00, '4/18', 26.69,121,  8.29, '25.A.png'),
    (26, 'PAT CUMMINS',       'PACER',         'OVERSEAS', 500, 175,  58,  515, 18.39, 152.21, '4/34', 31.06, 63,  8.78, '26.A.png'),
    (27, 'MOHAMMAD SHAMI',    'PACER',         'DOMESTIC', 500, 173, 110,   79,  5.27, 102.60, '4/11', 26.74,127,  8.44, '27.A.png'),
    (28, 'JOFRA ARCHER',      'PACER',         'OVERSEAS', 500, 172,  40,  201, 15.46, 148.05, '3/15', 24.39, 48,  7.43, '28.A.png'),
    (29, 'KAGISO RABADA',     'PACER',         'OVERSEAS', 500, 170,  80,  204, 11.33, 105.15, '4/21', 21.05,117,  8.42, '29.A.png'),
    (30, 'ARSHDEEP SINGH',    'PACER',         'DOMESTIC', 500, 168,  65,   32,  4.57,  67.39, '5/32', 26.34, 76,  8.76, '30.A.png')
),
normalized as (
  select
    r.*,
    upper(regexp_replace(trim(r.name), '[^A-Za-z0-9]', '', 'g')) as name_key
  from rows r
)
update public.players p
set
  role = n.role,
  category = case when upper(n.status) = 'OVERSEAS' then 'Overseas' else 'Domestic' end,
  country = n.status,
  image_url = n.image_file,
  base_price_lakhs = n.base_price_lakhs,
  credit_points = n.credit_points,
  matches_played = n.matches_played,
  total_runs = n.total_runs,
  batting_average = n.batting_average,
  strike_rate = n.strike_rate,
  best_bowling = n.best_bowling,
  bowling_average = n.bowling_average,
  wickets_taken = n.wickets_taken,
  economy = n.economy,
  is_round_three_iconic = true,
  available_from_round = 3,
  round_three_sequence = n.seq,
  updated_at = now()
from normalized n
where upper(regexp_replace(trim(p.name), '[^A-Za-z0-9]', '', 'g')) = n.name_key;

-- Quick check (optional)
-- select round_three_sequence, name, image_url, available_from_round, is_round_three_iconic
-- from public.players
-- where is_round_three_iconic = true
-- order by round_three_sequence;
