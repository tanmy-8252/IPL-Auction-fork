-- Seed the 30 Round-3 iconic players.
-- Safe to re-run: existing names are skipped.
-- Run migration 013 first so pool metadata columns exist.

with existing_max as (
  select coalesce(max(sl_no), 0) as max_sl_no
  from public.players
),
rows(seq, name, role, category, base_price_lakhs, credit_points, matches_played, total_runs, batting_average, strike_rate, best_bowling, bowling_average, wickets_taken, economy) as (
  values
    (1,  'VIRAT KOHLI',        'BATSMAN',        'DOMESTIC', 500, 200, 252, 8004, 38.67, 131.97, '2/25', 92.00,  4,  8.80),
    (2,  'ROHIT SHARMA',       'BATSMAN',        'DOMESTIC', 500, 196, 257, 6628, 29.72, 131.14, '4/6',  30.20, 15,  8.02),
    (3,  'SHREYAS IYER',       'BATSMAN',        'DOMESTIC', 500, 182, 115, 3127, 32.24, 127.48, '0',    0.00,   0,  7.00),
    (4,  'SHUBMAN GILL',       'BATSMAN',        'DOMESTIC', 500, 180, 103, 3088, 37.20, 135.20, '0',    0.00,   0,  0.00),
    (5,  'TRAVIS HEAD',        'BATSMAN',        'OVERSEAS', 500, 180,  25,  805, 36.59, 179.29, '1/11', 29.00,  2, 10.24),
    (6,  'MS DHONI',           'WICKET KEEPER',  'DOMESTIC', 500, 198, 264, 5243, 39.13, 137.54, '0',    0.00,   0,  0.00),
    (7,  'RISHABH PANT',       'WICKET KEEPER',  'DOMESTIC', 500, 182, 111, 3284, 35.31, 148.93, '0',    0.00,   0,  0.00),
    (8,  'JOS BUTTLER',        'WICKET KEEPER',  'OVERSEAS', 500, 192, 107, 3582, 38.11, 147.11, '0',    0.00,   0,  0.00),
    (9,  'KL RAHUL',           'WICKET KEEPER',  'DOMESTIC', 500, 190, 132, 4683, 45.47, 134.61, '0',    0.00,   0,  0.00),
    (10, 'ISHAN KISHAN',       'WICKET KEEPER',  'DOMESTIC', 500, 182, 105, 2644, 28.43, 135.87, '0',    0.00,   0,  0.00),
    (11, 'HARDIK PANDYA',      'ALL ROUNDER',    'DOMESTIC', 500, 195, 137, 2525, 30.06, 145.62, '3/17', 33.59, 64,  8.85),
    (12, 'RAVINDRA JADEJA',    'ALL ROUNDER',    'DOMESTIC', 500, 192, 240, 2959, 27.39, 129.72, '5/16', 30.41,160,  7.60),
    (13, 'ANDRE RUSSELL',      'ALL ROUNDER',    'OVERSEAS', 500, 195, 127, 2484, 29.22, 174.93, '5/15', 24.01,102,  9.24),
    (14, 'BEN STOKES',         'ALL ROUNDER',    'OVERSEAS', 500, 185,  45,  935, 24.61, 133.95, '3/15', 35.43, 28,  8.64),
    (15, 'SUNIL NARINE',       'ALL ROUNDER',    'OVERSEAS', 500, 185, 176, 1534, 17.04, 165.84, '5/19', 25.44,180,  6.73),
    (16, 'RASHID KHAN',        'ALL ROUNDER',    'OVERSEAS', 500, 194, 121,  545, 13.97, 158.43, '4/24', 21.82,149,  6.73),
    (17, 'AXAR PATEL',         'ALL ROUNDER',    'DOMESTIC', 500, 185, 150, 1653, 20.92, 130.88, '4/21', 30.55,123,  7.28),
    (18, 'KRUNAL PANDYA',      'ALL ROUNDER',    'DOMESTIC', 500, 187, 127, 1647, 21.39, 132.82, '3/14', 34.00, 76,  7.37),
    (19, 'MARCUS STONIS',      'ALL ROUNDER',    'OVERSEAS', 500, 178,  96, 1866, 28.27, 142.33, '4/40', 31.05, 43,  9.44),
    (20, 'TIM DAVID',          'ALL ROUNDER',    'OVERSEAS', 500, 175,  35,  658, 27.42, 170.91, '0',    0.00,   0, 13.50),
    (21, 'JASPRIT BUMRAH',     'PACER',          'DOMESTIC', 500, 197, 133,   64,  8.00,  91.43, '5/10', 22.51,165,  7.30),
    (22, 'BHUVNESHWAR KUMAR',  'PACER',          'DOMESTIC', 500, 195, 170,  284,  8.61,  92.22, '5/19', 27.23,181,  7.56),
    (23, 'MITCHELL STARC',     'PACER',          'OVERSEAS', 500, 192,  41,  114, 14.25,  98.00, '4/15', 23.94, 51,  8.21),
    (24, 'JOSH HAZLEWOOD',     'PACER',          'OVERSEAS', 500, 192,  30,   25, 25.00, 117.00, '4/25', 23.14, 39,  8.06),
    (25, 'TRENT BOULT',        'PACER',          'OVERSEAS', 500, 190, 101,  112, 10.18,  87.00, '4/18', 26.69,121,  8.29),
    (26, 'PAT CUMMINS',        'PACER',          'OVERSEAS', 500, 175,  58,  515, 18.39, 152.21, '4/34', 31.06, 63,  8.78),
    (27, 'MOHAMMAD SHAMI',     'PACER',          'DOMESTIC', 500, 173, 110,   79,  5.27, 102.60, '4/11', 26.74,127,  8.44),
    (28, 'JOFRA ARCHER',       'PACER',          'OVERSEAS', 500, 172,  40,  201, 15.46, 148.05, '3/15', 24.39, 48,  7.43),
    (29, 'KAGISO RABADA',      'PACER',          'OVERSEAS', 500, 170,  80,  204, 11.33, 105.15, '4/21', 21.05,117,  8.42),
    (30, 'ARSHDEEP SINGH',     'PACER',          'DOMESTIC', 500, 168,  65,   32,  4.57,  67.39, '5/32', 26.34, 76,  8.76)
),
new_rows as (
  select
    r.*,
    row_number() over (order by r.seq) as ordinal
  from rows r
  where not exists (
    select 1
    from public.players p
    where upper(trim(p.name)) = upper(trim(r.name))
  )
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
  em.max_sl_no + nr.ordinal,
  nr.name,
  nr.role,
  case when nr.category = 'OVERSEAS' then 'Overseas' else 'Domestic' end,
  nr.category,
  '',
  '',
  nr.base_price_lakhs,
  nr.credit_points,
  nr.matches_played,
  nr.total_runs,
  nr.batting_average,
  nr.strike_rate,
  nr.best_bowling,
  nr.bowling_average,
  nr.wickets_taken,
  nr.economy,
  0,
  'unsold',
  true,
  3,
  nr.seq,
  now(),
  now()
from new_rows nr
cross join existing_max em;
