import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://localhost:3131";
const url =
  origin +
  (process.argv.includes("--phone") ? "/demo/phone" : "/demo/command-center");
async function healthy() {
  try {
    const r = await fetch(origin + "/api/health", {
      signal: AbortSignal.timeout(1500),
    });
    const d = await r.json();
    return r.ok && d.service === "guardian-ai-new" && d.ready;
  } catch {
    return false;
  }
}
async function main() {
  if (!(await healthy())) {
    if (!existsSync(path.join(root, ".next/standalone/server.js"))) {
      console.log("Preparing GuardianAI. The first build may take a minute.");
      const npmCli = path.join(
        path.dirname(process.execPath),
        "node_modules/npm/bin/npm-cli.js",
      );
      if (!existsSync(npmCli))
        throw Error("Please run npm run build in the project folder first.");
      const build = spawnSync(process.execPath, [npmCli, "run", "build"], {
        cwd: root,
        stdio: "inherit",
        windowsHide: true,
      });
      if (build.status !== 0)
        throw Error("GuardianAI build failed. Please check the build output.");
    }
    const data = path.join(root, "data");
    mkdirSync(data, { recursive: true });
    const stdout = openSync(path.join(data, "demo.stdout.log"), "a"),
      stderr = openSync(path.join(data, "demo.stderr.log"), "a");
    const child = spawn(
      process.execPath,
      [path.join(root, "scripts/start.mjs"), "--port", "3131"],
      {
        cwd: root,
        detached: true,
        windowsHide: true,
        stdio: ["ignore", stdout, stderr],
      },
    );
    child.unref();
    closeSync(stdout);
    closeSync(stderr);
    writeFileSync(
      path.join(data, "launcher.json"),
      JSON.stringify({
        pid: child.pid,
        startedAt: new Date().toISOString(),
        url,
      }),
    );
    let ready = false;
    for (let n = 0; n < 60; n++) {
      if (await healthy()) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready)
      throw Error("GuardianAI could not start. See data/demo.stderr.log.");
  }
  console.log(`GuardianAI is running: ${url}`);
  if (!process.argv.includes("--no-open")) {
    // The URL is a fixed local application address, never shell input from users.
    const browser = spawn("cmd.exe", ["/d", "/c", "start", "", url], {
      windowsHide: true,
      stdio: "ignore",
    });
    browser.on("error", () =>
      console.error(`Open this address in your browser: ${url}`),
    );
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unable to open GuardianAI",
  );
  process.exitCode = 1;
});
