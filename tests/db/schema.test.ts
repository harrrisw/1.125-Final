import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migration in an in-process Postgres and checks the rules the
 * design depends on, as each role would experience them:
 *   - private rows are owner-only
 *   - nothing reaches a public table without the author's own confirmation
 */

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

type Role = "authenticated" | "service_role";

let db: PGlite;
let alice: string;
let bob: string;
let carol: string;

/** Run statements the way the API would: as a role, with (or without) a signed-in user. */
async function as<T>(role: Role, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(
    `set role ${role}; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function signUp(email: string): Promise<string> {
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email],
  );
  return res.rows[0].id;
}

async function propose(userId: string, type: string, payload: object): Promise<string> {
  return as("authenticated", userId, async () => {
    const res = await db.query<{ id: string }>(
      "insert into public.pending_actions (user_id, type, payload) values ($1, $2, $3) returning id",
      [userId, type, JSON.stringify(payload)],
    );
    return res.rows[0].id;
  });
}

const confirm = (userId: string, actionId: string) =>
  as("authenticated", userId, () =>
    db.query("select * from public.confirm_pending_action($1)", [actionId]),
  );

const execute = (actionId: string) =>
  as("service_role", null, async () => {
    const res = await db.query<{ result: { post_id: string } }>(
      "select public.execute_public_action($1) as result",
      [actionId],
    );
    return res.rows[0].result.post_id;
  });

/** Propose, confirm and execute in one go: the happy path for a post. */
async function publish(userId: string, type: string, payload: object): Promise<string> {
  const actionId = await propose(userId, type, payload);
  await confirm(userId, actionId);
  return execute(actionId);
}

const inTwoHours = () => new Date(Date.now() + 2 * 3_600_000).toISOString();

beforeAll(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(read("./supabase-stub.sql"));
  await db.exec(read("../../supabase/migrations/0001_init.sql"));
  await db.exec(read("../../supabase/migrations/0002_itineraries.sql"));
  // 0002 is safe to run again (someone re-running it after a failed attempt).
  await db.exec(read("../../supabase/migrations/0002_itineraries.sql"));

  alice = await signUp("alice@mit.edu");
  bob = await signUp("bob@g.harvard.edu");
  carol = await signUp("carol@bu.edu");
});

describe("sign-up", () => {
  it("accepts school addresses, including subdomains, and creates a neutral profile", async () => {
    const res = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = any($1::uuid[])",
      [[alice, bob, carol]],
    );
    expect(res.rows).toHaveLength(3);
    expect(res.rows.every((r) => r.display_name === "New member")).toBe(true);
  });

  it("rejects non-school addresses", async () => {
    await expect(signUp("eve@gmail.com")).rejects.toThrow(/school email/);
    await expect(signUp("mallory@notmit.edu.example.com")).rejects.toThrow(/school email/);
  });
});

describe("private zone", () => {
  it("keeps chat, memory and mood owner-only", async () => {
    await as("authenticated", alice, async () => {
      await db.query(
        "insert into public.messages (user_id, role, content) values ($1, 'user', 'long week')",
        [alice],
      );
      await db.query(
        "insert into public.memory_items (user_id, kind, content) values ($1, 'dislike', 'loud bars')",
        [alice],
      );
      await db.query(
        "insert into public.current_state (user_id, mood, expires_at) values ($1, '{tired}', now() + interval '6 hours')",
        [alice],
      );
    });

    await as("authenticated", bob, async () => {
      for (const table of ["messages", "memory_items", "current_state", "pending_actions"]) {
        const res = await db.query(`select * from public.${table}`);
        expect(res.rows, table).toHaveLength(0);
      }
      const updated = await db.query("update public.memory_items set content = 'tampered'");
      expect(updated.affectedRows).toBe(0);
    });

    await as("authenticated", alice, async () => {
      const res = await db.query<{ content: string }>("select content from public.memory_items");
      expect(res.rows.map((r) => r.content)).toEqual(["loud bars"]);
    });
  });

  it("does not let one user write rows as another", async () => {
    await as("authenticated", bob, async () => {
      await expect(
        db.query(
          "insert into public.memory_items (user_id, kind, content) values ($1, 'like', 'planted')",
          [alice],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe("confirm gate", () => {
  it("lets a session create a proposal but never a pre-confirmed action", async () => {
    await as("authenticated", alice, async () => {
      await expect(
        db.query(
          "insert into public.pending_actions (user_id, type, payload, status) values ($1, 'post_mood', '{}', 'confirmed')",
          [alice],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("gives sessions no way to change an action's status directly", async () => {
    const actionId = await propose(alice, "post_mood", { body: "anyone up for a walk?" });
    await as("authenticated", alice, async () => {
      const res = await db.query(
        "update public.pending_actions set status = 'confirmed' where id = $1",
        [actionId],
      );
      expect(res.affectedRows).toBe(0);
    });
  });

  it("gives sessions no way to write public tables directly, even with a confirmed draft", async () => {
    const actionId = await propose(alice, "post_mood", { body: "hello" });
    await confirm(alice, actionId);
    await as("authenticated", alice, async () => {
      await expect(
        db.query(
          "insert into public.posts (author_id, type, body, expires_at, created_from_action) values ($1, 'mood', 'hello', now() + interval '1 day', $2)",
          [alice, actionId],
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(db.query("select public.execute_public_action($1)", [actionId])).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("stops even the service role from publishing an unconfirmed draft", async () => {
    const actionId = await propose(alice, "post_mood", { body: "not yet confirmed" });
    await as("service_role", null, async () => {
      await expect(
        db.query(
          "insert into public.posts (author_id, type, body, expires_at, created_from_action) values ($1, 'mood', 'not yet confirmed', now() + interval '1 day', $2)",
          [alice, actionId],
        ),
      ).rejects.toThrow(/not confirmed/);
      await expect(db.query("select public.execute_public_action($1)", [actionId])).rejects.toThrow(
        /cannot be executed/,
      );
    });
    const posts = await db.query("select 1 from public.posts where body = 'not yet confirmed'");
    expect(posts.rows).toHaveLength(0);
  });

  it("only lets the owner confirm, and only from a signed-in session", async () => {
    const actionId = await propose(alice, "post_mood", { body: "confirm me" });

    await expect(confirm(bob, actionId)).rejects.toThrow(/not found, not yours/);
    await expect(
      as("service_role", null, () =>
        db.query("select * from public.confirm_pending_action($1)", [actionId]),
      ),
    ).rejects.toThrow(/signed-in user session/);

    const res = await confirm(alice, actionId);
    expect((res.rows[0] as { status: string }).status).toBe("confirmed");

    // A second tap is a no-op error, not a second confirmation.
    await expect(confirm(alice, actionId)).rejects.toThrow(/already handled/);
  });

  it("will not confirm an expired draft", async () => {
    const actionId = await propose(alice, "post_mood", { body: "too late" });
    await db.query(
      "update public.pending_actions set expires_at = now() - interval '1 minute' where id = $1",
      [actionId],
    );
    await expect(confirm(alice, actionId)).rejects.toThrow(/expired/);
  });

  it("publishes a confirmed plan once, with the author as host", async () => {
    const actionId = await propose(alice, "post_plan", {
      body: "Slow Saturday: gallery then coffee",
      area: "Cambridge",
      starts_at: inTwoHours(),
      capacity: 2,
    });
    await confirm(alice, actionId);
    const postId = await execute(actionId);

    const post = await db.query<{ author_id: string; type: string; status: string }>(
      "select author_id, type, status from public.posts where id = $1",
      [postId],
    );
    expect(post.rows[0]).toEqual({ author_id: alice, type: "plan", status: "published" });

    const members = await db.query<{ user_id: string; role: string }>(
      "select user_id, role from public.memberships where post_id = $1",
      [postId],
    );
    expect(members.rows).toEqual([{ user_id: alice, role: "host" }]);

    const action = await db.query<{ status: string }>(
      "select status from public.pending_actions where id = $1",
      [actionId],
    );
    expect(action.rows[0].status).toBe("executed");

    // Replaying the same action must not create a second post.
    await expect(execute(actionId)).rejects.toThrow(/cannot be executed/);
  });

  it("ties each public row to an action of the right type and owner", async () => {
    const calendarAction = await propose(alice, "calendar_add", {
      title: "Gallery",
      starts_at: inTwoHours(),
      ends_at: inTwoHours(),
    });
    await confirm(alice, calendarAction);
    const moodAction = await propose(alice, "post_mood", { body: "mine" });
    await confirm(alice, moodAction);

    await as("service_role", null, async () => {
      await expect(
        db.query(
          "insert into public.posts (author_id, type, body, expires_at, created_from_action) values ($1, 'mood', 'x', now() + interval '1 day', $2)",
          [alice, calendarAction],
        ),
      ).rejects.toThrow(/cannot create a mood post/);
      await expect(
        db.query(
          "insert into public.posts (author_id, type, body, expires_at, created_from_action) values ($1, 'mood', 'x', now() + interval '1 day', $2)",
          [bob, moodAction],
        ),
      ).rejects.toThrow(/different user/);
      await expect(db.query("select public.execute_public_action($1)", [calendarAction])).rejects.toThrow(
        /not a public action/,
      );
    });
  });
});

describe("joining and the board", () => {
  let planId: string;

  beforeAll(async () => {
    planId = await publish(alice, "post_plan", {
      body: "Pub trivia, Central Sq",
      area: "Cambridge",
      starts_at: inTwoHours(),
      capacity: 2,
    });
  });

  it("shows the plan on the board with a head count", async () => {
    await as("authenticated", bob, async () => {
      const res = await db.query<{ author_name: string; going_count: number; joined: boolean }>(
        "select author_name, going_count::int as going_count, joined from public.board_feed where id = $1",
        [planId],
      );
      expect(res.rows[0]).toEqual({ author_name: "New member", going_count: 1, joined: false });
    });
  });

  it("lets a confirmed join through and then enforces capacity", async () => {
    await publish(bob, "join_post", { post_id: planId });

    await as("authenticated", bob, async () => {
      const res = await db.query<{ going_count: number; joined: boolean }>(
        "select going_count::int as going_count, joined from public.board_feed where id = $1",
        [planId],
      );
      expect(res.rows[0]).toEqual({ going_count: 2, joined: true });
    });

    const late = await propose(carol, "join_post", { post_id: planId });
    await confirm(carol, late);
    await expect(execute(late)).rejects.toThrow(/plan is full/);
  });

  it("keeps the plan chat to members", async () => {
    await as("service_role", null, () =>
      db.query("insert into public.thread_messages (post_id, user_id, body) values ($1, $2, 'see you at 8')", [
        planId,
        alice,
      ]),
    );

    const count = (userId: string) =>
      as("authenticated", userId, async () => {
        const res = await db.query("select 1 from public.thread_messages where post_id = $1", [planId]);
        return res.rows.length;
      });
    expect(await count(bob)).toBe(1);
    expect(await count(carol)).toBe(0);
  });

  it("hides posts in both directions once someone blocks", async () => {
    const visibleTo = (userId: string) =>
      as("authenticated", userId, async () => {
        const res = await db.query("select 1 from public.board_feed where id = $1", [planId]);
        return res.rows.length;
      });
    expect(await visibleTo(carol)).toBe(1);

    await as("authenticated", alice, () =>
      db.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [alice, carol]),
    );
    expect(await visibleTo(carol)).toBe(0);

    const blockedJoin = await propose(carol, "join_post", { post_id: planId });
    await confirm(carol, blockedJoin);
    await expect(execute(blockedJoin)).rejects.toThrow(/not available|plan is full/);
  });
});

describe("retrieval", () => {
  const unit = (index: number) => {
    const v = new Array<number>(1024).fill(0);
    v[index] = 1;
    return `[${v.join(",")}]`;
  };

  beforeAll(async () => {
    await db.query(
      `insert into public.activities (source, external_id, title, address, energy, noise, embedding)
       values ('seed', 'quiet-cafe', 'Quiet cafe', '1 Main St, Cambridge', 2, 1, $1),
              ('seed', 'loud-bar', 'Loud bar', null, 4, 5, $2)`,
      [unit(0), unit(1)],
    );
    await as("authenticated", alice, () =>
      db.query(
        `insert into public.memory_items (user_id, kind, content, embedding)
         values ($1, 'like', 'quiet cafes', $2), ($1, 'dislike', 'loud bars', $3)`,
        [alice, unit(0), unit(1)],
      ),
    );
  });

  it("scores activities against the caller's own memories only", async () => {
    const candidates = (userId: string) =>
      as("authenticated", userId, async () => {
        const res = await db.query<{ title: string; address: string | null; interest_sim: number; dislike_sim: number }>(
          "select title, address, interest_sim, dislike_sim from public.candidate_activities(now(), now() + interval '1 day') order by title",
        );
        return res.rows;
      });

    expect(await candidates(alice)).toEqual([
      { title: "Loud bar", address: null, interest_sim: 0, dislike_sim: 1 },
      { title: "Quiet cafe", address: "1 Main St, Cambridge", interest_sim: 1, dislike_sim: 0 },
    ]);
    // Bob has no memories, so Alice's must not leak into his scores.
    expect(await candidates(bob)).toEqual([
      { title: "Loud bar", address: null, interest_sim: 0, dislike_sim: 0 },
      { title: "Quiet cafe", address: "1 Main St, Cambridge", interest_sim: 0, dislike_sim: 0 },
    ]);
  });

  it("recalls the caller's closest memories", async () => {
    await as("authenticated", alice, async () => {
      const res = await db.query<{ content: string; similarity: number }>(
        "select content, similarity from public.match_memories($1, 1)",
        [unit(1)],
      );
      expect(res.rows).toEqual([{ content: "loud bars", similarity: 1 }]);
    });
    await as("authenticated", bob, async () => {
      const res = await db.query("select * from public.match_memories($1, 5)", [unit(1)]);
      expect(res.rows).toHaveLength(0);
    });
  });
});

describe("saved plans", () => {
  let cafe: string;
  let walk: string;
  let home: string;

  beforeAll(async () => {
    const add = async (externalId: string, title: string, isPublic = true) => {
      const res = await db.query<{ id: string }>(
        `insert into public.activities (source, external_id, title, venue_name, area, lat, lng, url, is_public_venue)
         values ('seed', $1, $2, $2, 'Back Bay', 42.35, -71.08, 'https://example.org/' || $1, $3) returning id`,
        [externalId, title, isPublic],
      );
      return res.rows[0].id;
    };
    cafe = await add("plan-cafe", "Tea at a quiet cafe");
    walk = await add("plan-walk", "Walk by the river");
    home = await add("plan-home", "Someone's flat", false);
  });

  const save = (userId: string | null, stops: object[], replaceId: string | null = null) =>
    as("authenticated", userId, async () => {
      const res = await db.query<{ id: string }>(
        "select public.save_itinerary($1, $2, $3, null, $4) as id",
        ["Quiet evening", "Tea, then a walk", JSON.stringify(stops), replaceId],
      );
      return res.rows[0].id;
    });

  const plansOf = (viewer: string) =>
    as("authenticated", viewer, async () => {
      const plans = await db.query<{ id: string; title: string }>("select id, title from public.itineraries");
      const stops = await db.query<{ seq: number; title: string; url: string; lat: number }>(
        "select seq, title, url, lat from public.itinerary_stops order by itinerary_id, seq",
      );
      return { plans: plans.rows, stops: stops.rows };
    });

  it("saves the stops in order with venue details copied from the catalog", async () => {
    const id = await save(alice, [
      { activity_id: walk, note: "after tea" },
      { activity_id: cafe },
    ]);
    const mine = await plansOf(alice);
    expect(mine.plans).toEqual([{ id, title: "Quiet evening" }]);
    expect(mine.stops).toEqual([
      { seq: 1, title: "Walk by the river", url: "https://example.org/plan-walk", lat: 42.35 },
      { seq: 2, title: "Tea at a quiet cafe", url: "https://example.org/plan-cafe", lat: 42.35 },
    ]);
  });

  it("keeps a plan private to its owner", async () => {
    const theirs = await plansOf(bob);
    expect(theirs.plans).toHaveLength(0);
    expect(theirs.stops).toHaveLength(0);

    const [alicePlan] = (await plansOf(alice)).plans;
    await expect(
      as("authenticated", bob, () =>
        db.query(
          "insert into public.itinerary_stops (itinerary_id, user_id, seq, title) values ($1, $2, 9, 'intruder')",
          [alicePlan.id, bob],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("refuses a stop that is not a public place from the catalog, and saves nothing", async () => {
    const before = (await plansOf(alice)).plans.length;
    await expect(save(alice, [{ activity_id: cafe }, { activity_id: home }])).rejects.toThrow(
      /not a place from the catalog/,
    );
    await expect(
      save(alice, [{ activity_id: "00000000-0000-0000-0000-000000000000" }]),
    ).rejects.toThrow(/not a place from the catalog/);
    expect((await plansOf(alice)).plans).toHaveLength(before);
  });

  it("needs a signed-in user and between 1 and 8 stops", async () => {
    await expect(save(null, [{ activity_id: cafe }])).rejects.toThrow(/signed-in user/);
    await expect(save(alice, [])).rejects.toThrow(/between 1 and 8/);
    await expect(save(alice, Array.from({ length: 9 }, () => ({ activity_id: cafe })))).rejects.toThrow(
      /between 1 and 8/,
    );
  });

  it("replaces a plan only for its owner", async () => {
    const [old] = (await plansOf(alice)).plans;
    await expect(save(bob, [{ activity_id: cafe }], old.id)).rejects.toThrow(/not found/);

    const replacement = await save(alice, [{ activity_id: cafe }], old.id);
    const mine = await plansOf(alice);
    expect(mine.plans.map((p) => p.id)).toEqual([replacement]);
    expect(mine.stops.map((s) => s.title)).toEqual(["Tea at a quiet cafe"]);
  });
});
