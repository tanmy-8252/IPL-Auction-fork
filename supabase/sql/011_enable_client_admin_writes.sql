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
