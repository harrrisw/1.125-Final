/**
 * Memory-accuracy eval: runs the real Understand step over labelled messages.
 *   npm run eval:extraction
 *
 * This calls the Claude API once per item (10 short calls with the starter
 * set), so it needs ANTHROPIC_API_KEY and costs a small amount each run.
 * Target from the proposal: >= 85%.
 */
import { extractTurn } from "@/lib/understand/extract";
import labeled from "./labeled-chats.json";
import { accuracy, scoreItem, type Check, type Expectation } from "./score";

async function main() {
  const all: Check[] = [];

  for (const item of labeled.items) {
    const got = await extractTurn({ message: item.message, recent: [], knownFacts: [] });
    const checks = scoreItem(item.expect as Expectation, got);
    all.push(...checks);

    const failed = checks.filter((c) => !c.pass);
    console.log(`${failed.length === 0 ? "pass" : "FAIL"}  ${item.id}`);
    for (const c of failed) console.log(`        ${c.field}: ${c.detail}`);
  }

  console.log("\nBy field");
  for (const field of [...new Set(all.map((c) => c.field))]) {
    const subset = all.filter((c) => c.field === field);
    console.log(`  ${field.padEnd(15)} ${(accuracy(subset) * 100).toFixed(0)}%  (${subset.length} checks)`);
  }
  console.log(`\nOverall ${(accuracy(all) * 100).toFixed(1)}% over ${all.length} checks. Target: 85%.`);
  console.log(labeled.note);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
