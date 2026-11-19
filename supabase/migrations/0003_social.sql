-- Offhours schema v3: profiles people can read, and direct messages
--
-- Profiles: a short bio, hobbies, preferences and a current mood, all chosen
-- by the person for others to see. Nothing here is copied from private
-- memory; the app only suggests memory items the person can add themselves.
-- Profile text is public, so it is written by the server after moderation,
-- never directly by a client.
--
-- Direct messages: one conversation per pair of members. Only the two people
-- in it can read it, and a block in either direction hides it and stops new
-- messages. Messages are written by the server after moderation.
--
-- Run this after 0002_itineraries.sql. It is safe to run more than once.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists hobbies text[] not null default '{}';
alter table public.profiles add column if not exists preferences text[] not null default '{}';
alter table public.profiles add column if not exists mood text;
alter table public.profiles add column if not exists mood_expires_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length check (char_length(bio) <= 280);
alter table public.profiles drop constraint if exists profiles_mood_length;
alter table public.profiles add constraint profiles_mood_length check (char_length(mood) <= 80);
alter table public.profiles drop constraint if exists profiles_list_sizes;
alter table public.profiles add constraint profiles_list_sizes
  check (cardinality(hobbies) <= 12 and cardinality(preferences) <= 12);

-- Profile text is public: the server moderates it and writes it with the
-- service role. A client could otherwise skip moderation by updating the row.
drop policy if exists "users update their own profile" on public.profiles;

-- ---------------------------------------------------------------------------
-- Direct messages
-- ---------------------------------------------------------------------------

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  -- The pair is stored in a fixed order so each pair has one conversation.
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  user_a_read_at timestamptz,
  user_b_read_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists dm_threads_a_idx on public.dm_threads (user_a, last_message_at desc);
create index if not exists dm_threads_b_idx on public.dm_threads (user_b, last_message_at desc);
alter table public.dm_threads enable row level security;

drop policy if exists "dm threads: the two people in them" on public.dm_threads;
create policy "dm threads: the two people in them" on public.dm_threads
  for select to authenticated
  using (
    auth.uid() in (user_a, user_b)
    and not public.is_blocked_between(user_a, user_b)
  );

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at);
alter table public.dm_messages enable row level security;

-- Read-only for clients. No write policies on purpose: messages go through
-- send_direct_message() after the server has moderated them.
drop policy if exists "dm messages: the two people in the thread" on public.dm_messages;
create policy "dm messages: the two people in the thread" on public.dm_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.dm_threads t
      where t.id = thread_id
        and auth.uid() in (t.user_a, t.user_b)
        and not public.is_blocked_between(t.user_a, t.user_b)
    )
  );

-- Sends a message from one member to another, starting their conversation
-- if needed. Service role only: the web server calls it for the signed-in
-- sender after moderation, so a client cannot skip the check.
create or replace function public.send_direct_message(
  p_sender uuid,
  p_recipient uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a uuid := least(p_sender, p_recipient);
  v_b uuid := greatest(p_sender, p_recipient);
  v_thread uuid;
  v_body text := btrim(p_body);
begin
  if p_sender is null or p_recipient is null or p_sender = p_recipient then
    raise exception 'a message needs someone else to send it to' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient) then
    raise exception 'this member could not be found' using errcode = 'check_violation';
  end if;
  if public.is_blocked_between(p_sender, p_recipient) then
    raise exception 'you cannot message this member' using errcode = 'check_violation';
  end if;
  if v_body is null or char_length(v_body) not between 1 and 1000 then
    raise exception 'a message is 1 to 1000 characters' using errcode = 'check_violation';
  end if;

  insert into public.dm_threads (user_a, user_b)
  values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;
  select id into v_thread from public.dm_threads where user_a = v_a and user_b = v_b;

  insert into public.dm_messages (thread_id, sender_id, body) values (v_thread, p_sender, v_body);

  -- Sending a message also means the sender has read the conversation.
  update public.dm_threads
     set last_message_at = now(),
         user_a_read_at = case when p_sender = v_a then now() else user_a_read_at end,
         user_b_read_at = case when p_sender = v_b then now() else user_b_read_at end
   where id = v_thread;

  return v_thread;
end;
$$;

revoke all on function public.send_direct_message(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.send_direct_message(uuid, uuid, text) to service_role;

-- Marks a conversation read for the signed-in member. Does nothing for anyone else.
create or replace function public.mark_dm_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dm_threads
     set user_a_read_at = case when user_a = auth.uid() then now() else user_a_read_at end,
         user_b_read_at = case when user_b = auth.uid() then now() else user_b_read_at end
   where id = p_thread_id
     and auth.uid() in (user_a, user_b);
end;
$$;

revoke all on function public.mark_dm_read(uuid) from public, anon;
grant execute on function public.mark_dm_read(uuid) to authenticated;

-- The inbox: each of the caller's conversations with the other person's name,
-- the latest message, and whether it is unread. Row-level security on the
-- underlying tables decides what each caller sees.
create or replace view public.dm_inbox
with (security_invoker = true) as
select
  t.id,
  o.other_id,
  p.display_name as other_name,
  t.last_message_at,
  last.body as last_body,
  last.sender_id as last_sender_id,
  (last.sender_id is not null
    and last.sender_id <> auth.uid()
    and (o.my_read_at is null or o.my_read_at < last.created_at)) as unread
from public.dm_threads t
cross join lateral (
  select
    case when t.user_a = auth.uid() then t.user_b else t.user_a end as other_id,
    case when t.user_a = auth.uid() then t.user_a_read_at else t.user_b_read_at end as my_read_at
) o
join public.profiles p on p.id = o.other_id
left join lateral (
  select m.body, m.sender_id, m.created_at
  from public.dm_messages m
  where m.thread_id = t.id
  order by m.created_at desc
  limit 1
) last on true;

-- Reports can point at a direct message.
alter table public.reports add column if not exists dm_message_id uuid
  references public.dm_messages (id) on delete set null;
