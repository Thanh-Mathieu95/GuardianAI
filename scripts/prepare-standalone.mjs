import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
const root = process.cwd(),
  target = path.join(root, ".next", "standalone");
if (!existsSync(path.join(target, "server.js")))
  throw new Error("Build the standalone Next server first.");
// A deployable artifact must never contain local credentials or session data.
for (const name of [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
]) {
  const file = path.resolve(target, name);
  if (path.dirname(file) !== target) throw new Error("Invalid artifact path");
  if (existsSync(file)) rmSync(file);
}
cpSync(
  path.join(root, ".next", "static"),
  path.join(target, ".next", "static"),
  { recursive: true },
);
if (existsSync(path.join(root, "public")))
  cpSync(path.join(root, "public"), path.join(target, "public"), {
    recursive: true,
  });
console.log("Standalone assets prepared; local environment files excluded.");
