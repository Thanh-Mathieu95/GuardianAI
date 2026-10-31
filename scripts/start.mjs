import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
try {
  process.loadEnvFile(".env.local");
} catch {}
const args = process.argv.slice(2),
  index = args.indexOf("--port");
const port = index >= 0 ? args[index + 1] : process.env.PORT || "3131";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error("Invalid port");
const server = path.resolve(".next/standalone/server.js");
if (!existsSync(server)) {
  console.error("Run npm run build first.");
  process.exit(1);
}
// Keep a relative SQLite path anchored to the project, not the standalone folder.
if (!process.env.DATABASE_URL && process.env.DATABASE_PATH !== ":memory:")
  process.env.DATABASE_PATH = path.resolve(
    process.env.DATABASE_PATH || "data/guardian.sqlite",
  );
const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    PORT: port,
    HOSTNAME: process.env.GUARDIAN_BIND_HOST || "127.0.0.1",
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code || 0));
