# Offhours

An AI companion for free time that learns your moods and interests, and lets you join what others are up to. Term project for 1.125 Agentic Engineering.

This repository is the scaffold: the full architecture is in place, the core logic is tested, the app runs against a Supabase project with Claude through MIT Parley, and a full chat turn, the memory page and the confirm gate have been run once with a test account. It has not been used by real people yet. See [What is verified](#what-is-verified) before relying on any part.

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
- An outing can have several stops. When you settle on one, the companion can save it with `save_plan`. Saved plans live in the **Plans** tab: each shows its stops in order with links, a map with the route drawn between them, and one link that opens the whole route in Google Maps.
- Saved plans are private, like memory, so saving one needs no confirm card. Sharing an outing with other people is still a board post and still goes through the confirm gate.
- The map draws OpenStreetMap tiles. Their free tile server is fine for a small pilot; a larger launch should switch to a tile provider (`TILES` in `src/components/places-map.tsx`).

## One chat turn

1. **Understand** (`src/lib/understand`): a structured-output call extracts mood, energy, who you want around, free time, and lasting facts.
2. **Remember** (`src/lib/memory`): mood goes to `current_state` and fades in 6 hours; lasting facts go to `memory_items`. New facts are shown in chat as "Noted" chips with Undo.
3. **Recall**: the most relevant memories plus the live mood go into the agent's context.
4. **Match** (`src/lib/matcher`): hard filters, then `interest x mood x social` scoring, then an LLM re-rank that explains each pick.
5. **Offer** (`src/lib/agent`): the agent presents up to three picks and can draft a post, a join or a calendar entry.
6. **Act** (`src/lib/gate`): your tap confirms the draft, moderation checks any public text, and only then is it carried out.

## Layout

| Path | What lives there |
| --- | --- |
| `supabase/migrations/0001_init.sql` | Schema, row-level security, the confirm-gate functions and triggers |
| `supabase/migrations/0002_itineraries.sql` | Saved plans (private itineraries with ordered stops), and street addresses for the matcher's candidates |
| `src/lib/agent/` | System prompt, the five agent tools, the turn runner |
| `src/lib/understand/` | Extraction schema and call |
| `src/lib/memory/` | Long-term profile and current state |
| `src/lib/matcher/` | Filters, scoring, re-rank, candidate loading |
| `src/lib/gate/` | `propose.ts` (agent side) and `execute.ts` (confirm side), kept apart on purpose |
| `src/lib/safety/` | Moderation for anything that becomes public |
| `src/lib/integrations/` | Seed catalog, Google Places, Ticketmaster, calendar link |
| `src/app/api/` | Chat stream, confirm and cancel, join, plan chat, memory, cron jobs |
| `src/app/(app)/` | Chat, Board, Plans (`/planner`), Memory, and board-post pages (`/plans/[id]`) |
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

1. Create a project at [supabase.com](https://supabase.com). In the SQL editor, run the contents of `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_itineraries.sql` (safe to run again if it was interrupted). Each should end with "Success. No rows returned".
2. In Supabase, under Authentication > URL Configuration, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/confirm` as a redirect URL.

   Two things to know about sign-in while testing:
   - Supabase's built-in mailer only delivers to members of your Supabase organization, at about 2 emails an hour. Sign in to Offhours with the address your Supabase account uses, and that address must be on an allowed school domain. Before the pilot, set up custom SMTP (Authentication > Emails > SMTP Settings).
   - Open the emailed link in the same browser you requested it from. With the default email templates the link only completes there.
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

Sign-in is by emailed link and only accepts the school domains listed in `allowed_email_domains` (see the top of the migration). Add your own domain there to test.

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

Not yet verified:

- With 0002 on the live project: the companion saving a multi-stop plan, the Plans tab and plan page (route map, links, remove a stop, delete), the Undo on the saved-plan card, and map links that search by street address.

- The emailed sign-in link. The test account skipped email, so Supabase's mailer and the `?code=` link style have not been exercised.
- Joining someone else's plan, which needs two accounts. Capacity and block rules are tested in PGlite only.
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

- Live updates on the board and in plan chats (currently refresh on action).
- Report and block buttons in the UI. The tables and rules exist; the screens do not.
- A way to post a mood or plan without going through chat.
- Replace the ranking eval's placeholder scenarios with simulated users, and tune the scoring weights. The harness already shows one case to look at: a strong profile can outweigh a clearly different mood.
- Schedule `/api/cron/ingest` and `/api/cron/expire`.
