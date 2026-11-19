-- Offhours schema v2: saved plans, and addresses for map links
--
-- A saved plan is a private itinerary: an ordered list of stops the user chose
-- to keep from a conversation. It belongs to the private zone: owner only,
-- never on the board. Sharing an outing with others still means a board post,
-- and that still goes through the confirm gate.
--
-- Run this after 0001_init.sql. It is safe to run more than once.

create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  note text check (char_length(note) <= 500),
  -- Provenance: the chat message this plan came out of.
  source_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists itineraries_user_idx on public.itineraries (user_id, created_at desc);
alter table public.itineraries enable row level security;

drop policy if exists "own itineraries: all" on public.itineraries;
create policy "own itineraries: all" on public.itineraries
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Venue details are copied in when the plan is saved, so a plan still reads
-- correctly after the catalog is refreshed or an activity is removed.
create table if not exists public.itinerary_stops (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seq int not null check (seq >= 1),
  activity_id uuid references public.activities (id) on delete set null,
  title text not null,
  venue_name text,
  address text,
  area text,
  lat double precision,
  lng double precision,
  url text,
  note text check (char_length(note) <= 300),
  starts_at timestamptz
);
create index if not exists itinerary_stops_plan_idx on public.itinerary_stops (itinerary_id, seq);
alter table public.itinerary_stops enable row level security;

drop policy if exists "own itinerary stops: all" on public.itinerary_stops;
create policy "own itinerary stops: all" on public.itinerary_stops
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.itineraries i
      where i.id = itinerary_id and i.user_id = auth.uid()
    )
  );

-- Saves a plan and its stops in one step, as the signed-in user. Stops are
-- given as [{"activity_id": uuid, "note": text?, "starts_at": timestamptz?}]
-- in visiting order; every one must be a public venue from the catalog, so a
-- plan can never hold an invented place. p_replace_id swaps out an earlier
-- plan of the same user, which is how a saved plan is changed.
create or replace function public.save_itinerary(
  p_title text,
  p_note text,
  p_stops jsonb,
  p_source_message_id uuid default null,
  p_replace_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_wanted int;
  v_saved int;
begin
  if v_user is null then
    raise exception 'saving a plan requires a signed-in user session'
      using errcode = 'insufficient_privilege';
  end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'a plan needs a list of stops' using errcode = 'check_violation';
  end if;
  v_wanted := jsonb_array_length(p_stops);
  if v_wanted < 1 or v_wanted > 8 then
    raise exception 'a plan has between 1 and 8 stops' using errcode = 'check_violation';
  end if;

  if p_replace_id is not null then
    delete from public.itineraries where id = p_replace_id and user_id = v_user;
    if not found then
      raise exception 'the plan to replace was not found' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.itineraries (user_id, title, note, source_message_id)
  values (v_user, btrim(p_title), nullif(btrim(p_note), ''), p_source_message_id)
  returning id into v_id;

  insert into public.itinerary_stops
    (itinerary_id, user_id, seq, activity_id, title, venue_name, address, area, lat, lng, url, note, starts_at)
  select
    v_id, v_user, s.ord::int, a.id, a.title, a.venue_name, a.address, a.area, a.lat, a.lng, a.url,
    nullif(btrim(s.stop ->> 'note'), ''),
    (s.stop ->> 'starts_at')::timestamptz
  from jsonb_array_elements(p_stops) with ordinality as s (stop, ord)
  join public.activities a
    on a.id = (s.stop ->> 'activity_id')::uuid and a.is_public_venue;
  get diagnostics v_saved = row_count;

  if v_saved <> v_wanted then
    raise exception 'one of the stops is not a place from the catalog'
      using errcode = 'check_violation';
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_itinerary(text, text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.save_itinerary(text, text, jsonb, uuid, uuid) to authenticated;

-- Candidates now carry the street address, so an idea's map link can search
-- by address rather than by neighborhood. Same as in 0001 apart from the
-- added column; the return type changes, so the function is dropped first.
drop function if exists public.candidate_activities(timestamptz, timestamptz, int);
create function public.candidate_activities(
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 200
)
returns table (
  id uuid,
  source text,
  title text,
  description text,
  category text,
  tags text[],
  venue_name text,
  address text,
  area text,
  lat double precision,
  lng double precision,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes int,
  energy smallint,
  noise smallint,
  group_fit text[],
  price_level smallint,
  url text,
  interest_sim real,
  dislike_sim real
)
language sql
stable
set search_path = public, extensions
as $$
  select
    a.id, a.source, a.title, a.description, a.category, a.tags, a.venue_name,
    a.address, a.area, a.lat, a.lng, a.starts_at, a.ends_at, a.duration_minutes,
    a.energy, a.noise, a.group_fit, a.price_level, a.url,
    coalesce((
      select max(1 - (a.embedding <=> m.embedding))
      from public.memory_items m
      where m.user_id = auth.uid()
        and m.kind in ('interest', 'like', 'outing')
        and m.embedding is not null
    ), 0)::real as interest_sim,
    coalesce((
      select max(1 - (a.embedding <=> m.embedding))
      from public.memory_items m
      where m.user_id = auth.uid()
        and m.kind = 'dislike'
        and m.embedding is not null
    ), 0)::real as dislike_sim
  from public.activities a
  where a.is_public_venue
    and (a.starts_at is null or (a.starts_at >= p_from and a.starts_at <= p_to))
  order by a.starts_at nulls last
  limit p_limit;
$$;
