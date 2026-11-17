// Starts `next dev` for Claude's browser preview (see launch.json).
//
// Next.js cannot write its telemetry settings file from inside the Claude app
// and exits with EXDEV if it tries, so telemetry is switched off for this
// process only. Running `npm run dev` in your own terminal does not need this.
import { spawn } from "node:child_process";

// The preview may hand us a different port when 3000 is taken.
const port = process.env.PORT ?? "3000";

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--port", port],
  { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
);

child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
