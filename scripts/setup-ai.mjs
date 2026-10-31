import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, ".env.local");
async function ask(prompt) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}
async function secret(prompt) {
  if (!stdin.isTTY)
    throw new Error("Run SETUP-AI.cmd in an interactive terminal.");
  stdout.write(prompt);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("keypress", handler);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const handler = (text, key) => {
      if (key?.ctrl && key.name === "c") {
        finish();
        reject(new Error("Configuration cancelled."));
        return;
      }
      if (key?.name === "return") {
        finish();
        resolve(value.trim());
        return;
      }
      if (key?.name === "backspace") {
        if (value) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      if (text && !key?.ctrl && !/[\r\n\x00-\x1f]/.test(text)) {
        value += text;
        stdout.write("*".repeat(text.length));
      }
    };
    stdin.on("keypress", handler);
  });
}
try {
  console.log(
    "\nGUARDIAN AI - OPENAI GPT SETUP\nYour API key stays in .env.local. Do not paste it into chat.\n",
  );
  const provider = "OPENAI";
  let env;
  try {
    env = await readFile(file, "utf8");
  } catch {
    await copyFile(path.join(root, ".env.example"), file);
    env = await readFile(file, "utf8");
  }
  const model =
    (await ask("GPT model name [gpt-4.1-mini]: ")) || "gpt-4.1-mini";
  if (!model || !/^[a-zA-Z0-9._:/-]{1,150}$/.test(model))
    throw new Error(
      "Enter a valid GPT model name supported by your OpenAI project.",
    );
  const updates = {
    AI_PROVIDER: provider,
    AI_MODEL: model,
    AI_TIMEOUT_MS: "25000",
  };
  const key = await secret("OPENAI_API_KEY (hidden; blank keeps existing): ");
  if (key) updates.OPENAI_API_KEY = key;
  else {
    const existing = env.match(/^OPENAI_API_KEY=(.*)$/m)?.[1]?.trim();
    if (!existing || existing === '""' || existing === "''")
      throw new Error("An OpenAI API key is required.");
  }
  for (const [name, value] of Object.entries(updates)) {
    const line = `${name}=${JSON.stringify(value).replace(/\$/g, "\\$")}`;
    const pattern = new RegExp("^" + name + "=.*$", "m");
    env = pattern.test(env)
      ? env.replace(pattern, () => line)
      : env + "\n" + line;
  }
  await writeFile(file, env, { encoding: "utf8", mode: 0o600 });
  console.log(
    `\nSaved ${provider} / ${model}. API keys are not printed.\nRestart the Guardian server (Ctrl+C, then START-GUARDIAN.cmd).\nOpen the AI badge -> Test AI -> Consent -> Enable AI for this session.\n`,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Configuration failed.",
  );
  process.exitCode = 1;
}
