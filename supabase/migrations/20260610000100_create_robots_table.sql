create table if not exists public.robots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  robot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);

create index if not exists robots_team_id_updated_at_idx
  on public.robots (team_id, updated_at desc);
