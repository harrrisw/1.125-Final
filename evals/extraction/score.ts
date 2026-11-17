import type { Extraction } from "@/lib/understand/schema";

/**
 * Scoring for the memory-accuracy eval. Each labelled item yields several
 * yes/no checks; accuracy is checks passed over checks made. Pure, so the
 * scoring itself can be unit-tested.
 */

export interface Expectation {
  /** Passes if any extracted mood word is in this list. Empty list = expect no mood. */
  moodAny: string[];
  /** [low, high] inclusive, or null when no energy should be extracted. */
  energy: [number, number] | null;
  social: "solo" | "small_group" | "open" | null;
  timeBudgetMinutes: [number, number] | null;
  /** Each expected fact must be matched by a fact of that kind containing every keyword. */
  facts: { kind: string; keywords: string[] }[];
}

export interface Check {
  field: "mood" | "energy" | "social" | "time" | "fact_recall" | "fact_precision";
  pass: boolean;
  detail: string;
}

function inRange(value: number | null, range: [number, number] | null): boolean {
  if (range === null) return value === null;
  return value !== null && value >= range[0] && value <= range[1];
}

export function scoreItem(expect: Expectation, got: Extraction): Check[] {
  const checks: Check[] = [];

  const mood = got.state.mood.map((m) => m.toLowerCase());
  checks.push({
    field: "mood",
    pass:
      expect.moodAny.length === 0
        ? mood.length === 0
        : mood.some((m) => expect.moodAny.includes(m)),
    detail: `got [${mood.join(", ")}]`,
  });
  checks.push({
    field: "energy",
    pass: inRange(got.state.energy, expect.energy),
    detail: `got ${got.state.energy}`,
  });
  checks.push({
    field: "social",
    pass: got.state.social === expect.social,
    detail: `got ${got.state.social}`,
  });
  checks.push({
    field: "time",
    pass: inRange(got.state.timeBudgetMinutes, expect.timeBudgetMinutes),
    detail: `got ${got.state.timeBudgetMinutes}`,
  });

  const matched = new Set<number>();
  for (const wanted of expect.facts) {
    const index = got.facts.findIndex(
      (f, i) =>
        !matched.has(i) &&
        f.kind === wanted.kind &&
        wanted.keywords.every((k) => f.content.toLowerCase().includes(k.toLowerCase())),
    );
    if (index >= 0) matched.add(index);
    checks.push({
      field: "fact_recall",
      pass: index >= 0,
      detail: `wanted ${wanted.kind} ~ ${wanted.keywords.join("+")}`,
    });
  }

  // Every extracted fact that no label asked for counts against precision.
  // This is the check that catches invented or over-eager memories.
  const extras = got.facts.filter((_, i) => !matched.has(i));
  checks.push({
    field: "fact_precision",
    pass: extras.length === 0,
    detail: extras.length ? `unexpected: ${extras.map((f) => `${f.kind}:${f.content}`).join("; ")}` : "none extra",
  });

  return checks;
}

export function accuracy(checks: Check[]): number {
  return checks.length === 0 ? 0 : checks.filter((c) => c.pass).length / checks.length;
}
