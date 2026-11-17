-- Offhours schema v1
--
-- Three zones:
--   private : messages, memory_items, current_state, pending_actions, calendar_links
--   shared  : profiles, activities, rec_events, memory_feedback
--   public  : posts, memberships, thread_messages, reports, blocks
--
-- The rule this file enforces: nothing reaches a public table unless the
-- author confirmed it from their own signed-in session.
--   1. Clients have no INSERT/UPDATE/DELETE policy on posts, memberships or
--      thread_messages. Only service-role server code writes them.
--   2. Every post and membership carries created_from_action, and a trigger
--      rejects the insert unless that pending action is 'confirmed', belongs
--      to the same user and has a matching type.
--   3. An action only becomes 'confirmed' through confirm_pending_action(),
--      which requires auth.uid() -- so a cron job or any other service-role
--      caller cannot confirm on a user's behalf.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Sign-up: school email only
-- ---------------------------------------------------------------------------

create table public.allowed_email_domains (
  domain text primary key check (domain = lower(domain))
);
alter table public.allowed_email_domains enable row level security;

-- Pilot community. Subdomains match too (g.harvard.edu, alum.mit.edu).
insert into public.allowed_email_domains (domain) values
  ('mit.edu'), ('harvard.edu'), ('bu.edu'), ('northeastern.edu'),
  ('tufts.edu'), ('bc.edu'), ('brandeis.edu'), ('emerson.edu'),
  ('berklee.edu'), ('wellesley.edu'), ('umb.edu'), ('suffolk.edu');

create function public.is_allowed_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.allowed_email_domains d
    where lower(split_part(p_email, '@', 2)) = d.domain
       or lower(split_part(p_email, '@', 2)) like '%.' || d.domain
  );
$$;

create function public.enforce_school_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or not public.is_allowed_email(new.email) then
    raise exception 'Offhours is limited to school email addresses'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enforce_school_email
  before insert on auth.users
  for each row execute function public.enforce_school_email();

-- ---------------------------------------------------------------------------
-- Shared: profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  home_area text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles are visible to signed-in users"
  on public.profiles for select to authenticated using (true);
create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Neutral default name: nothing derived from the email goes public.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'New member'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Private: chat
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- UI cards attached to an assistant message: picks, "noted" chips, confirm cards.
  cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_user_created_idx on public.messages (user_id, created_at desc);
alter table public.messages enable row level security;

create policy "own messages: read" on public.messages
  for select to authenticated using (user_id = auth.uid());
create policy "own messages: write" on public.messages
  for insert to authenticated with check (user_id = auth.uid());
create policy "own messages: delete" on public.messages
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Private: two-layer memory
-- ---------------------------------------------------------------------------

-- Layer 1: long-term profile. Kept for months; the user can edit or delete any row.
create table public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('interest', 'like', 'dislike', 'constraint', 'outing')),
  content text not null check (char_length(content) between 1 and 500),
  embedding extensions.vector(1024),
  confidence real not null default 0.7 check (confidence between 0 and 1),
  -- Provenance: which message taught the agent this, so it can say what it learned.
  source_message_id uuid references public.messages (id) on delete set null,
  edited_by_user boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memory_items_user_idx on public.memory_items (user_id, kind);
create index memory_items_embedding_idx on public.memory_items
  using hnsw (embedding extensions.vector_cosine_ops);
alter table public.memory_items enable row level security;

create policy "own memory: all" on public.memory_items
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Layer 2: current state. One row per user, overwritten each turn, ignored once expired.
create table public.current_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mood text[] not null default '{}',
  energy smallint check (energy between 1 and 5),
  social text check (social in ('solo', 'small_group', 'open')),
  time_budget_minutes int check (time_budget_minutes > 0),
  note text,
  source_message_id uuid references public.messages (id) on delete set null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.current_state enable row level security;

create policy "own state: all" on public.current_state
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Shared: activity catalog (places, events, seed data)
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('seed', 'places', 'ticketmaster')),
  external_id text not null,
  title text not null,
  description text,
  category text,
  tags text[] not null default '{}',
  venue_name text,
  address text,
  area text,
  lat double precision,
  lng double precision,
  -- "Public venues only": the matcher never offers a row where this is false.
  is_public_venue boolean not null default true,
  -- Null start = a place you can go any time; set = a dated event.
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes int check (duration_minutes > 0),
  -- Mood-fit attributes, tagged once at ingest so scoring stays cheap and explainable.
  energy smallint check (energy between 1 and 5),
  noise smallint check (noise between 1 and 5),
  group_fit text[] not null default '{solo,small_group,open}',
  price_level smallint check (price_level between 0 and 4),
  url text,
  embedding extensions.vector(1024),
  fetched_at timestamptz not null default now(),
  unique (source, external_id)
);
create index activities_starts_idx on public.activities (starts_at);
create index activities_embedding_idx on public.activities
  using hnsw (embedding extensions.vector_cosine_ops);
alter table public.activities enable row level security;

create policy "activities are visible to signed-in users"
  on public.activities for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Private: the confirm gate
-- ---------------------------------------------------------------------------

create table public.pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('post_mood', 'post_plan', 'join_post', 'calendar_add')),
  payload jsonb not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'executed', 'cancelled', 'failed', 'expired')),
  proposed_by text not null default 'agent' check (proposed_by in ('agent', 'user')),
  source_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  result jsonb
);
create index pending_actions_user_idx on public.pending_actions (user_id, status, created_at desc);
alter table public.pending_actions enable row level security;

create policy "own actions: read" on public.pending_actions
  for select to authenticated using (user_id = auth.uid());
-- A session can only ever create a *proposal*. There is deliberately no UPDATE
-- policy: status moves only through the functions below.
create policy "own actions: propose" on public.pending_actions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'proposed'
    and confirmed_at is null
    and executed_at is null
    and result is null
  );

create function public.confirm_pending_action(p_action_id uuid)
returns public.pending_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_action public.pending_actions;
begin
  if v_uid is null then
    raise exception 'confirmation requires a signed-in user session'
      using errcode = 'insufficient_privilege';
  end if;

  update public.pending_actions
     set status = 'confirmed', confirmed_at = now()
   where id = p_action_id
     and user_id = v_uid
     and status = 'proposed'
     and expires_at > now()
  returning * into v_action;

  if not found then
    raise exception 'action not found, not yours, expired, or already handled'
      using errcode = 'no_data_found';
  end if;
  return v_action;
end;
$$;

create function public.cancel_pending_action(p_action_id uuid)
returns public.pending_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_action public.pending_actions;
begin
  if v_uid is null then
    raise exception 'cancelling requires a signed-in user session'
      using errcode = 'insufficient_privilege';
  end if;

  update public.pending_actions
     set status = 'cancelled'
   where id = p_action_id and user_id = v_uid and status = 'proposed'
  returning * into v_action;

  if not found then
    raise exception 'action not found, not yours, or already handled'
      using errcode = 'no_data_found';
  end if;
  return v_action;
end;
$$;

revoke all on function public.confirm_pending_action(uuid) from public, anon;
revoke all on function public.cancel_pending_action(uuid) from public, anon;
grant execute on function public.confirm_pending_action(uuid) to authenticated;
grant execute on function public.cancel_pending_action(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public: board, joins, plan chats
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('mood', 'plan')),
  -- Exactly the text the author saw on the confirm card. Never raw memory.
  body text not null check (char_length(body) between 1 and 500),
  activity_id uuid references public.activities (id) on delete set null,
  area text,
  starts_at timestamptz,
  capacity int check (capacity between 2 and 50),
  status text not null default 'published' check (status in ('published', 'expired', 'removed')),
  created_from_action uuid not null references public.pending_actions (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index posts_feed_idx on public.posts (status, expires_at);
alter table public.posts enable row level security;

create table public.memberships (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('host', 'member')),
  created_from_action uuid not null references public.pending_actions (id),
  joined_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);
alter table public.memberships enable row level security;

create table public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index thread_messages_post_idx on public.thread_messages (post_id, created_at);
alter table public.thread_messages enable row level security;

create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;

create policy "own blocks: all" on public.blocks
  for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  thread_message_id uuid references public.thread_messages (id) on delete set null,
  reported_user_id uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;

create policy "own reports: read" on public.reports
  for select to authenticated using (reporter_id = auth.uid());
create policy "own reports: file" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');

-- Blocks hide in both directions. Security definer so the check can see the
-- other person's block row without exposing it.
create function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create function public.is_member(p_post_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.post_id = p_post_id and m.user_id = p_user_id
  );
$$;

-- Read-only for clients. No write policies on purpose.
create policy "published posts are visible to signed-in users" on public.posts
  for select to authenticated
  using (
    author_id = auth.uid()
    or (status = 'published' and not public.is_blocked_between(auth.uid(), author_id))
  );
create policy "memberships are visible to signed-in users" on public.memberships
  for select to authenticated using (true);
create policy "members read their plan chat" on public.thread_messages
  for select to authenticated
  using (
    public.is_member(post_id, auth.uid())
    and not public.is_blocked_between(auth.uid(), user_id)
  );

-- The invariant behind "0 unintended posts".
create function public.require_confirmed_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.pending_actions;
  v_owner uuid;
begin
  select * into v_action
    from public.pending_actions
   where id = new.created_from_action
     for update;

  if not found then
    raise exception 'public write without a pending action'
      using errcode = 'check_violation';
  end if;
  if v_action.status <> 'confirmed' then
    raise exception 'pending action % is %, not confirmed', v_action.id, v_action.status
      using errcode = 'check_violation';
  end if;

  if tg_table_name = 'posts' then
    v_owner := new.author_id;
    if (new.type = 'mood' and v_action.type <> 'post_mood')
       or (new.type = 'plan' and v_action.type <> 'post_plan') then
      raise exception 'pending action % has type %, which cannot create a % post',
        v_action.id, v_action.type, new.type
        using errcode = 'check_violation';
    end if;
  else
    v_owner := new.user_id;
    if (new.role = 'host' and v_action.type not in ('post_mood', 'post_plan'))
       or (new.role = 'member' and v_action.type <> 'join_post') then
      raise exception 'pending action % has type %, which cannot create a % membership',
        v_action.id, v_action.type, new.role
        using errcode = 'check_violation';
    end if;
  end if;

  if v_action.user_id <> v_owner then
    raise exception 'pending action % belongs to a different user', v_action.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger posts_require_confirmed_action
  before insert on public.posts
  for each row execute function public.require_confirmed_action();
create trigger memberships_require_confirmed_action
  before insert on public.memberships
  for each row execute function public.require_confirmed_action();

-- Runs a confirmed public action atomically. Service role only: the web
-- server calls this after confirm_pending_action() and moderation both pass.
create function public.execute_public_action(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.pending_actions;
  v_post public.posts;
  v_post_id uuid;
  v_starts_at timestamptz;
  v_going int;
begin
  select * into v_action
    from public.pending_actions
   where id = p_action_id
     for update;

  if not found then
    raise exception 'action % not found', p_action_id using errcode = 'no_data_found';
  end if;
  if v_action.status <> 'confirmed' then
    raise exception 'action % is % and cannot be executed', v_action.id, v_action.status
      using errcode = 'check_violation';
  end if;

  if v_action.type in ('post_mood', 'post_plan') then
    v_starts_at := nullif(v_action.payload ->> 'starts_at', '')::timestamptz;

    insert into public.posts
      (author_id, type, body, activity_id, area, starts_at, capacity, expires_at, created_from_action)
    values (
      v_action.user_id,
      case v_action.type when 'post_mood' then 'mood' else 'plan' end,
      v_action.payload ->> 'body',
      nullif(v_action.payload ->> 'activity_id', '')::uuid,
      nullif(v_action.payload ->> 'area', ''),
      v_starts_at,
      nullif(v_action.payload ->> 'capacity', '')::int,
      case v_action.type
        when 'post_mood' then
          now() + make_interval(hours => coalesce(nullif(v_action.payload ->> 'expires_in_hours', '')::int, 24))
        else
          coalesce(v_starts_at, now()) + interval '6 hours'
      end,
      v_action.id
    )
    returning id into v_post_id;

    insert into public.memberships (post_id, user_id, role, created_from_action)
    values (v_post_id, v_action.user_id, 'host', v_action.id);

  elsif v_action.type = 'join_post' then
    v_post_id := (v_action.payload ->> 'post_id')::uuid;

    select * into v_post from public.posts where id = v_post_id for update;
    if not found or v_post.status <> 'published' or v_post.expires_at <= now() then
      raise exception 'this post is no longer open' using errcode = 'check_violation';
    end if;
    if public.is_blocked_between(v_action.user_id, v_post.author_id) then
      raise exception 'this post is not available' using errcode = 'check_violation';
    end if;
    if v_post.capacity is not null then
      select count(*) into v_going from public.memberships where post_id = v_post_id;
      if v_going >= v_post.capacity then
        raise exception 'this plan is full' using errcode = 'check_violation';
      end if;
    end if;

    insert into public.memberships (post_id, user_id, role, created_from_action)
    values (v_post_id, v_action.user_id, 'member', v_action.id)
    on conflict (post_id, user_id) do nothing;

  else
    raise exception 'action type % is not a public action', v_action.type
      using errcode = 'check_violation';
  end if;

  update public.pending_actions
     set status = 'executed',
         executed_at = now(),
         result = jsonb_build_object('post_id', v_post_id)
   where id = v_action.id;

  return jsonb_build_object('post_id', v_post_id);
end;
$$;

revoke all on function public.execute_public_action(uuid) from public, anon, authenticated;
grant execute on function public.execute_public_action(uuid) to service_role;

-- Board feed: open posts with author name and head count.
create view public.board_feed
with (security_invoker = true) as
select
  p.id,
  p.type,
  p.body,
  p.area,
  p.starts_at,
  p.capacity,
  p.activity_id,
  p.author_id,
  pr.display_name as author_name,
  p.created_at,
  p.expires_at,
  (select count(*) from public.memberships m where m.post_id = p.id) as going_count,
  public.is_member(p.id, auth.uid()) as joined
from public.posts p
join public.profiles pr on pr.id = p.author_id
where p.status = 'published' and p.expires_at > now();

-- ---------------------------------------------------------------------------
-- Private: calendar link. Tokens never go to the browser: no client policies.
-- ---------------------------------------------------------------------------

create table public.calendar_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  refresh_token_encrypted text not null,
  scope text not null,
  created_at timestamptz not null default now()
);
alter table public.calendar_links enable row level security;

-- ---------------------------------------------------------------------------
-- Shared: telemetry for the success criteria
-- ---------------------------------------------------------------------------

-- One row per recommendation shown, clicked or joined, tagged with the ranker
-- variant so mood+profile can be compared with profile-only.
create table public.rec_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event text not null check (event in ('impression', 'click', 'propose', 'join', 'dismiss')),
  ranker_variant text not null,
  activity_id uuid references public.activities (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  rank smallint,
  score real,
  source_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);
create index rec_events_user_idx on public.rec_events (user_id, created_at desc);
alter table public.rec_events enable row level security;

create policy "own rec events: read" on public.rec_events
  for select to authenticated using (user_id = auth.uid());
create policy "own rec events: write" on public.rec_events
  for insert to authenticated with check (user_id = auth.uid());

-- What the user said about each thing the agent learned. Holds no memory
-- text, so deleting a memory really deletes it while the accuracy metric survives.
create table public.memory_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  memory_kind text not null,
  verdict text not null check (verdict in ('confirmed', 'corrected', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.memory_feedback enable row level security;

create policy "own memory feedback: read" on public.memory_feedback
  for select to authenticated using (user_id = auth.uid());
create policy "own memory feedback: write" on public.memory_feedback
  for insert to authenticated with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Retrieval
-- ---------------------------------------------------------------------------

-- Top-k of the caller's own memories for a query embedding. Security invoker:
-- RLS still applies, so this can only ever return the caller's rows.
create function public.match_memories(p_query extensions.vector(1024), p_limit int default 8)
returns table (id uuid, kind text, content text, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  select m.id, m.kind, m.content, (1 - (m.embedding <=> p_query))::real as similarity
  from public.memory_items m
  where m.user_id = auth.uid() and m.embedding is not null
  order by m.embedding <=> p_query
  limit p_limit;
$$;

-- Candidate activities in a time window, each with the caller's interest and
-- dislike similarity (best match against their own memory embeddings).
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
    a.area, a.lat, a.lng, a.starts_at, a.ends_at, a.duration_minutes,
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
