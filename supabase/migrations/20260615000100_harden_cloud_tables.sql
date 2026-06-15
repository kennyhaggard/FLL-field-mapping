alter table if exists public.teams enable row level security;
alter table if exists public.missions enable row level security;
alter table if exists public.robots enable row level security;

do $$
begin
  if to_regclass('public.teams') is not null then
    execute 'revoke all on table public.teams from anon, authenticated';
  end if;

  if to_regclass('public.missions') is not null then
    execute 'revoke all on table public.missions from anon, authenticated';
  end if;

  if to_regclass('public.robots') is not null then
    execute 'revoke all on table public.robots from anon, authenticated';
  end if;

  if to_regprocedure('public.verify_team_pin(uuid,text)') is not null then
    execute 'alter function public.verify_team_pin(uuid,text) set search_path = public, pg_temp';
    execute 'revoke all on function public.verify_team_pin(uuid,text) from public, anon, authenticated';
  end if;
end $$;
