# Offhours

An AI companion for free time that learns your moods and interests, and lets you join what others are up to. Term project for 1.125 Agentic Engineering.

This repository is the scaffold: the full architecture is in place, the core logic is tested, the app runs against a Supabase project with Claude through MIT Parley, and the chat, memory, confirm gate, saved plans, Explore, board, group chats, profiles and direct messages have been run with test accounts. It has not been used by real people yet. See [What is verified](#what-is-verified) before relying on any part.

## The idea in one rule

**The agent can draft, but only a person can publish.**

The agent's tools write a *draft* to `pending_actions`. Only a signed-in person tapping Confirm can carry a draft out, and the database refuses any public row that does not trace back to a draft its author confirmed. That turns the "0 unintended posts" success criterion into a property of the structure rather than of the prompt.

```
 Web app        Agent chat   Memory page   Confirm cards     Board   Plan chats
                    |             |              |              |         |
 Private zone   Agent loop -> Understand -> Memory -> Matcher   |         |
 (owner only)       |                                           |         |
                    +--- proposes draft ---> CONFIRM GATE ---> Public zone
                                            (your tap +         board, joins,
                                             moderation)        chats, safety
                    |                                           |
 Postgres       private tables     activities (shared)     public tables
 + pgvector     chat, memory,      places and events       posts, joins,
                mood, drafts                               messages
```

## Ideas, links and saved plans

- Every idea the companion offers links to the venue's website (when the catalog has one) and to Google Maps, and "Show on a map" opens an in-app map with a numbered pin per idea.
- An outing can have several stops. The companion searches once per stop, saying what the stop is for and where ("art" near "Cambridge", then "a film"), and says so when a stop cannot be filled rather than offering something else in its place. When you settle on an outing, it can save it with `save_plan`, in the same message if you ask it to plan and save at once. Saved plans live in the **Plans** tab: each shows its stops in order with links, a map with the route drawn between them, and one link that opens the whole route in Google Maps (transit between two stops; with more, Google Maps on the web has no transit route, so it opens without a set mode).
- Saved plans are private, like memory, so saving one needs no confirm card. Sharing an outing with other people is still a board post and still goes through the confirm gate.
- The map draws OpenStreetMap tiles. Their free tile server is fine for a small pilot; a larger launch should switch to a tile provider (`TILES` in `src/components/places-map.tsx`).

## Explore, the board, profiles and messages

- **Explore** (`/explore`) browses places, events and other people's posts without the companion. Mood chips (Calm, Curious, Social, Active, Outdoors, Artsy, Hungry) match on catalog attributes and words; a keyword search and a calendar filter (today, tonight, tomorrow, this weekend, or a date, in Boston time) narrow it further. Results are ordered by the same scoring as the companion's picks, using your private mood and memory for the order only. A keyword that matches nothing shows nothing rather than unrelated options. Each place has its links, a map, and "Post a plan here".
- **The board** has the same keyword and date filters plus Plans/Moods, and a composer to post a mood or a plan directly. Posting goes through the same confirm gate and moderation as a draft from the companion: what you type is exactly what is shown, and your tap on Post is the confirmation. Every post opens its **group chat**; Join takes you straight into it, and the page lists who is in, links to the place, and refreshes every few seconds.
- **Profiles** (`/profile` to edit, `/people/[id]` to view) show a name, area, short bio, hobbies, "likes to", and a current mood that fades after 12 hours. Nothing is copied from private memory: the editor only offers remembered interests and your chat mood as one-tap suggestions. Profile text is public, so the server moderates it and writes it with the service role; migration 0003 removes the client's own update policy so moderation cannot be skipped.
- **Direct messages** (`/messages`) are one conversation per pair, readable only by the two people. Start one with Message on someone's profile. Messages are moderated for harassment, sexual content, pressure to meet somewhere private, illegal activity and spam; unlike public text, sharing your own number is allowed. A block in either direction hides the conversation, the profile and each other's posts, and stops new messages; Report sends a note (with the message it is about) to the `reports` table.
- Chats refresh by polling every few seconds while the tab is visible (`src/components/auto-refresh.tsx`). Supabase Realtime can replace it later.

## One chat turn

1. **Understand** (`src/lib/understand`): a structured-output call extracts mood, energy, who you want around, free time, and lasting facts.
2. **Remember** (`src/lib/memory`): mood goes to `current_state` and fades in 6 hours; lasting facts go to `memory_items`. New facts are shown in chat as "Noted" chips with Undo.
3. **Recall**: the most relevant memories plus the live mood go into the agent's context.
4. **Match** (`src/lib/matcher`): hard filters, an optional place to stay near, then `interest x mood x social` scoring, an optional kind of thing asked for (`focus.ts`), and an LLM re-rank that explains each pick.
5. **Offer** (`src/lib/agent`): the agent presents up to three picks and can draft a post, a join or a calendar entry.
6. **Act** (`src/lib/gate`): your tap confirms the draft, moderation checks any public text, and only then is it carried out.

## Layout

| Path | What lives there |
| --- | --- |
| `supabase/migrations/0001_init.sql` | Schema, row-level security, the confirm-gate functions and triggers |
| `supabase/migrations/0002_itineraries.sql` | Saved plans (private itineraries with ordered stops), and street addresses for the matcher's candidates |
| `supabase/migrations/0003_social.sql` | Profile fields, direct messages (`dm_threads`, `dm_messages`, the `dm_inbox` view, `send_direct_message`), and reports on a message |
| `src/lib/agent/` | System prompt, the five agent tools, the turn runner |
| `src/lib/understand/` | Extraction schema and call |
| `src/lib/memory/` | Long-term profile and current state |
| `src/lib/matcher/` | Filters, scoring, re-rank, candidate loading |
| `src/lib/gate/` | `propose.ts` (agent side) and `execute.ts` (confirm side), kept apart on purpose |
| `src/lib/safety/` | Moderation for anything that becomes public |
| `src/lib/integrations/` | Seed catalog, Google Places, Ticketmaster, calendar link |
| `src/app/api/` | Chat stream, confirm and cancel, posting and joining, group chat, profile, direct messages, block and report, memory, cron jobs |
| `src/app/(app)/` | Chat, Explore, Board, Messages, Plans (`/planner`), Profile, Memory, other members' profiles (`/people/[id]`), and each post's group chat (`/plans/[id]`) |
| `src/lib/explore.ts`, `src/lib/when.ts` | Mood chips, keyword and date filters (calendar windows in Boston time) for Explore and the board |
| `src/lib/profiles.ts`, `src/lib/messages.ts` | Profiles (moderated saves, block, report) and direct messages |
| `src/lib/links.ts`, `src/components/places-map.tsx` | Website and Google Maps links for every idea, and the in-app map |
| `src/lib/itineraries.ts` | Saved plans: save, list, remove a stop, delete |
| `tests/` | Unit tests, plus database tests that run the real migration in-process |
| `evals/` | Ranking ablation (offline) and memory-accuracy eval (calls the API) |
| `data/seed-activities.json` | Sample Boston-area catalog |

## Setup

You need Node.js 22 or newer.

```bash
npm install
```

1. Create a project at [supabase.com](https://supabase.com). In the SQL editor, run the contents of `supabase/migrations/0001_init.sql`, then `0002_itineraries.sql`, then `0003_social.sql` (0002 and 0003 are safe to run again if interrupted). Each should end with "Success. No rows returned". If the editor warns about a destructive operation (the files drop and recreate their own policies), confirm with "Run this query"; otherwise nothing is applied.
2. In Supabase, under Authentication > URL Configuration, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/confirm` as a redirect URL.

   Sign-in is by school email and password. Two things to know while testing:
   - New accounts need a confirmation email while Supabase's "Confirm email" setting is on (Authentication > Sign In / Providers > Email), and Supabase's built-in mailer only delivers to members of your Supabase organization, at about 2 emails an hour. To let people create accounts without email for now, switch "Confirm email" off; switch it back on, with custom SMTP (Authentication > Emails > SMTP Settings), before the pilot so addresses are proven to belong to the person.
   - An account first made with an emailed sign-in link has no password. "Forgot password?" on the sign-in page emails a link that opens a "Set a new password" page (open it in the same browser), or run `npm run set-password` (it asks for the email and the password; the password is not shown or stored anywhere but Supabase). Once signed in, the password can be changed on the Profile page.
3. Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

   The Supabase values are under Settings > API Keys (the project URL is also in the Connect dialog). The publishable key goes in `NEXT_PUBLIC_SUPABASE_ANON_KEY` and the secret key in `SUPABASE_SERVICE_ROLE_KEY`; the older anon and service_role keys work too.

   For Claude, either use a key from platform.claude.com, or go through MIT Parley: set `OFFHOURS_LLM_BASE_URL=https://parley.api.mit.edu` and put a key generated at [parley.mit.edu](https://parley.mit.edu) in `ANTHROPIC_API_KEY`. Then check the connection:

```bash
npm run check:llm
```

   It lists the models your key can reach and makes every kind of call the app uses (about six short calls). If a model is missing from the list, set `OFFHOURS_AGENT_MODEL` and `OFFHOURS_WORKER_MODEL` to ids that are in it. MIT limits Parley to low- and medium-risk data and bills API use by credits, so check both before the pilot.

4. Load the sample activities:

```bash
npm run seed
```

5. Start the app:

```bash
npm run dev
```

Accounts are only for the school domains listed in `allowed_email_domains` (see the top of the migration). Add your own domain there to test.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app at http://localhost:3000 |
| `npm test` | Unit tests and database rule tests (no network, no keys) |
| `npm run typecheck` | Generate route types and typecheck |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run seed` | Load `data/seed-activities.json` into the database |
| `npm run check:llm` | Check the Claude key, endpoint and models by making each kind of call the app uses |
| `npm run set-password` | Give an existing account a password (for accounts made with an emailed link) |
| `npm run eval:ranking` | Offline ablation: mood + profile vs profile-only, top-3 |
| `npm run eval:extraction` | Memory-accuracy eval. Calls the Claude API once per labelled item |

## How the success criteria are measured

| Criterion | Where it comes from |
| --- | --- |
| Memory accuracy >= 85% | `evals/extraction` against labelled chats; in the pilot, the `memory_feedback` table (confirmed, corrected, rejected) |
| +20% top-3 hit rate, mood + profile vs profile-only | `evals/ranking`; in the pilot, `rec_events` grouped by `ranker_variant` (set `OFFHOURS_RANKER_VARIANT`) |
| 0 unintended posts | Enforced by the schema and checked by `tests/db/schema.test.ts` and `tests/gate.test.ts`; in the pilot, every post has a `created_from_action` you can audit |
| Pilot join rate >= 30% | `rec_events` rows with `event = 'join'`, per user. Only joining someone else's post is logged; hosting a plan is not |

## What is verified

Run on this machine when the scaffold was written:

- `npm run typecheck`, `npm run lint` and `npm run build` pass.
- `npm test` passes: matcher scoring and filters, memory merging, the gate's lifecycle, and the database rules (privacy, sign-up restriction, no public row without a confirmed draft, capacity, blocks) against the real migration running in PGlite.
- `npm run eval:ranking` runs. Its scenarios are placeholders, so its numbers are not a result.
- The app starts and every page loads in a browser at desktop and phone width with no console errors. With no database configured, the app pages show the setup notice, sign-in reports that setup is missing, and the API routes answer 503 with a clear message.

- `npm run check:llm` passes through MIT Parley with `claude-opus-5-5` and `claude-haiku-5-5`: extraction, re-rank and moderation with their real prompts and schemas, and a streaming agent loop with a test tool. Parley keeps no conversation state, so the app sends the full history each turn there (`thread: false` on the SDK's tool runner) and leaves out the refusal fallback and eager tool input.
- Against a live Supabase project: the migration applies cleanly, `npm run seed` loads the 17 sample activities (without embeddings), a signed-out client sees no private rows and is refused `execute_public_action`, `/chat` redirects to sign-in, and the sign-in form turns away a non-school address.
- One run in the browser as a test account (created through the admin API, signed in with a one-time link, removed afterwards):
  - A chat turn: the message was read into a mood and three facts, picks came back with reasons, and the reply streamed in.
  - The memory page showed the mood and facts; deleting a fact removed it and logged a `rejected` row in `memory_feedback`.
  - Asked to post a plan, the agent wrote a draft and stopped at a confirm card. Tapping Confirm ran moderation and published it; the post and the host membership both point at the confirmed draft.
  - The board and the plan page showed the post. The plan chat took a normal message and refused one with a phone number.
  - With the service-role key, inserting a post from an unconfirmed draft, confirming a draft, and executing an unconfirmed draft were all refused by the database.
  - Sign-out worked, and deleting the account removed its messages, memory, drafts and posts.
- Through MIT Parley, streamed replies need a repair step: Parley removes the model's thinking block but forwards one leftover event for it, which crashes the SDK's stream reader. `src/lib/llm/sse.ts` drops such events and `tests/llm.test.ts` covers it.

- Links and saved plans: the 15 sample venues with a website I could reach have `url` set (Castle Island and the Middlesex Fells have only the map link). The saved-plans tables, their privacy rules, `save_itinerary`, re-running 0002, and the address column are tested in PGlite, and the link builders in `tests/links.test.ts`. Signed out, `/planner` redirects to sign-in.
- A second test-account run (before 0002 was on the live project; account removed afterwards):
  - Asked for a quiet afternoon around Back Bay or Cambridge, the companion offered three picks, each with a working Website link and an Open in Google Maps link that open in a new tab, and suggested combining two of them into one outing.
  - "Show all 3 on a map" showed an OpenStreetMap map with pins numbered like the cards, in the right places; tapping a pin showed its name and a Google Maps link.
  - The Plans tab showed the "one more database step" notice. Asked to save the plan, the companion said it could not, gave the plan in text and offered a calendar entry instead.

- A third test-account run, with 0002 on the live project (account removed afterwards):
  - Signed out, `save_itinerary` is refused and no saved plans are visible; the matcher returns street addresses.
  - Asked for "something artsy, a walk and a film" in Cambridge, the companion first found only the walk: the search had no way to ask for a kind of thing or an area, always returned the same top three, and two searches in one turn showed every card twice. With `looking_for` and `near` it found Mount Auburn Cemetery, the Harvard Art Museums and the Brattle Theatre, with no repeated cards.
  - "Yes, save it please" saved a three-stop plan with the times discussed (stored correctly as Eastern time), each stop's address, website and coordinates copied in, and a card linking to it. In a later message, "save a shorter version instead" saved a two-stop plan in one turn.
  - The plan page showed the stops, a map with numbered pins and the route line, per-stop links that search by address, and a route link. Removing a stop renumbered the rest; Delete asked first and then left an empty Plans tab.
  - Google Maps snapped bare coordinates to the shop next to the Brattle and showed no transit route through a middle stop, so the route link now names each stop by name and address and asks for transit only between two stops. Opened again, Google found all three venues.
  - Undo on the card removed the plan. After a reload the card says the plan is no longer saved, instead of offering an Undo that would do nothing.

- Explore, the board, profiles and messages: the 0003 rules are tested in PGlite (profile text cannot be written by a client; only the server can send a message; one conversation per pair, readable by those two only; a block hides it both ways and stops sending; deleting an account removes its conversations; re-running 0003), and the filters and Boston-time windows in `tests/explore.test.ts`.
- A run with two test accounts, A and B, with 0003 on the live project (both removed afterwards):
  - Signed out, `send_direct_message` is refused and no messages are visible.
  - B filled in a profile (moderated, saved, mood shown until 12 hours later). In Explore, Artsy listed Club Passim, the three art museums and the Brattle; "Post a plan here" on the Brattle opened the board composer with the place chosen. The plan (Sunday 7 PM, group of 4) went through the gate and moderation and opened its group chat.
  - As A, Explore with "film" and "this weekend" found B's plan and the Brattle. Opening the post from the board showed who is in and a Join prompt; Join opened the group chat with B's message, and A's reply posted.
  - A opened B's profile from the post (bio, hobbies, likes to, current mood, B's plan), tapped Message and sent a direct message, which opened the new conversation. An insulting message was refused. B saw it as unread in Messages, opened it, and replied with a phone number, which direct messages allow.
  - B reported A (the report points at A's message) and blocked A. The conversation disappeared for both; for A, B's profile reads "not available", messaging B is refused, and B's plan is gone from the board.
  - Found and fixed in the run: Explore crashed because the mood definitions (with functions) were passed to the filter bar in the browser; the plan composer read the picked time in the device's timezone (now always Boston time); MIT Parley's own guardrail refuses abusive text outright, which the moderation call treated as "could not check, try again" (now: not approved, reword it); and the six-tab menu made pages scroll sideways on a phone (it now wraps).

Not yet verified:

- Replacing a saved plan with `replace_plan_id` from chat (tested in PGlite only).
- Unblocking from a profile in the browser, a profile save refused by moderation, and a full plan's group chat staying closed (each covered by tests, not run live).

- Password sign-in: a wrong password gets "That email and password do not match." from Supabase, Create account turns away a non-school address, `npm run set-password` finds accounts by email, "Forgot password?" answers the same whether or not an account exists, an expired link explains itself, and `/reset-password` without a valid link asks for a new one. A successful sign-up and sign-in with a password, the confirmation and reset emails (the built-in mailer was over its hourly limit), and the Profile page's password form have not been run against the live project yet.
- The calendar entry, the Undo on a "Noted" chip, and editing a memory.
- Claude through Anthropic's own API. Only the MIT Parley route has been run.
- The Voyage embeddings call, and the Google Places and Ticketmaster adapters, which are marked in their files as not yet run against the live APIs.

## Known gaps and next steps

Midpoint (agent + memory):

- Run the app end to end and tune the system prompt and extraction prompt on real conversations.
- Grow `evals/extraction/labeled-chats.json` to 50 or more items and get a baseline.
- Calendar: today, confirming a calendar entry gives a prefilled Google Calendar link. Replace with Google OAuth and a server-side insert (`src/lib/integrations/calendar.ts`).
- Replace the hand-set mood attributes on ingested activities with an LLM tagger.

Final (social layer + pilot):

- Replace polling in the group chats and messages with Supabase Realtime, and show unread messages in the menu.
- A screen for the people running the pilot to review reports (today they are rows in `reports`).
- Rate limits on direct messages to people you have not talked with before.
- Replace the ranking eval's placeholder scenarios with simulated users, and tune the scoring weights. The harness already shows one case to look at: a strong profile can outweigh a clearly different mood.
- Schedule `/api/cron/ingest` and `/api/cron/expire`.
