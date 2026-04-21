-- Generates/refreshes a JSON manifest in SQL result format for your 30 iconic players.
-- Copy the JSON output and upload it as: player-image-manifest.json in bucket player-images.
--
-- Why this helps:
-- /api/player-image/[slNo] checks manifest first.
-- This lets serial-number based lookups resolve 1.A.png style files exactly.

select jsonb_object_agg(round_three_sequence::text, image_url order by round_three_sequence) as manifest_json
from public.players
where is_round_three_iconic = true
  and available_from_round = 3
  and round_three_sequence between 1 and 30
  and coalesce(image_url, '') <> '';

-- Validation 1: rows that are missing or mismatched image filename.
with expected(seq, expected_image) as (
  values
    (1, '1.A.png'), (2, '2.A.png'), (3, '3.A.png'), (4, '4.A.png'), (5, '5.A.png'),
    (6, '6.A.png'), (7, '7.A.png'), (8, '8.A.png'), (9, '9.A.png'), (10, '10.A.png'),
    (11, '11.A.png'), (12, '12.A.png'), (13, '13.A.png'), (14, '14.A.png'), (15, '15.A.png'),
    (16, '16.A.png'), (17, '17.A.png'), (18, '18.A.png'), (19, '19.A.png'), (20, '20.A.png'),
    (21, '21.A.png'), (22, '22.A.png'), (23, '23.A.png'), (24, '24.A.png'), (25, '25.A.png'),
    (26, '26.A.png'), (27, '27.A.png'), (28, '28.A.png'), (29, '29.A.png'), (30, '30.A.png')
)
select
  e.seq as round_three_sequence,
  p.name,
  e.expected_image,
  p.image_url as current_image_url,
  case
    when p.id is null then 'MISSING_PLAYER_ROW'
    when coalesce(p.image_url, '') = '' then 'MISSING_IMAGE_URL'
    when p.image_url <> e.expected_image then 'IMAGE_FILENAME_MISMATCH'
    else 'OK'
  end as validation_status
from expected e
left join public.players p
  on p.is_round_three_iconic = true
 and p.available_from_round = 3
 and p.round_three_sequence = e.seq
where p.id is null
   or coalesce(p.image_url, '') = ''
   or p.image_url <> e.expected_image
order by e.seq;

-- Validation 2: readiness summary for quick pass/fail.
with expected(seq) as (
  values
    (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),
    (11),(12),(13),(14),(15),(16),(17),(18),(19),(20),
    (21),(22),(23),(24),(25),(26),(27),(28),(29),(30)
),
iconic as (
  select
    round_three_sequence,
    image_url
  from public.players
  where is_round_three_iconic = true
    and available_from_round = 3
    and round_three_sequence between 1 and 30
)
select
  (select count(*) from iconic) as iconic_rows_found,
  (select count(*) from iconic where coalesce(image_url, '') <> '') as iconic_rows_with_image,
  (select count(*) from expected e left join iconic i on i.round_three_sequence = e.seq where i.round_three_sequence is null) as missing_sequence_rows,
  case
    when (select count(*) from iconic) = 30
     and (select count(*) from iconic where coalesce(image_url, '') <> '') = 30
     and (select count(*) from expected e left join iconic i on i.round_three_sequence = e.seq where i.round_three_sequence is null) = 0
    then 'READY'
    else 'NOT_READY'
  end as manifest_readiness;
