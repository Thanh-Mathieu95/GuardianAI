// Starts a Cloudflare quick tunnel to the local server and records its public URL,
// so invite / pairing links in the app point at the tunnel instead of 127.0.0.1.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const file = new URL("../data/tunnel-url.json", import.meta.url);
const port = Number(process.argv[2] || process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port phải từ 1 đến 65535");
const target = `http://127.0.0.1:${port}`;
mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
const child = spawn("npx", ["-y", "cloudflared", "tunnel", "--url", target], { shell: true });
let found = "";
const scan = (chunk) => {
  const text = chunk.toString();
  process.stderr.write(text);
  const m = !found && text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!m) return;
  found = m[0];
  writeFileSync(file, JSON.stringify({ url: found, target, startedAt: new Date().toISOString() }));
  console.log(`\n==============================================\n  LINK CONG KHAI: ${found}\n  Link moi / ghep dien thoai trong app se tu dung link nay.\n==============================================\n`);
};
child.stdout.on("data", scan);
child.stderr.on("data", scan);
const cleanup = () => {
  try { if (JSON.parse(readFileSync(file, "utf8")).url === found) rmSync(file, { force: true }); } catch {}
};
child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    cleanup();
    child.kill();
    process.exit(0);
  });
