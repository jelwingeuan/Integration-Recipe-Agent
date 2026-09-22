import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareContext, sanitizeText } from "./lib.mjs";

const contextDir = path.resolve(".recipe-context");
await mkdir(contextDir, { recursive: true });

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  return writeFile(process.env.GITHUB_OUTPUT, `${name}=${String(value).replace(/\r?\n/g, " ")}\n`, { flag: "a" });
}

let issueNumber = "";
try {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  issueNumber = event.issue?.number ?? "";
  const configPath = path.resolve(process.env.PARTNER_CONFIG ?? ".github/recipe-agent/partner.json");
  const partner = JSON.parse(await readFile(configPath, "utf8"));
  const request = await prepareContext({ event, partner, contextDir });
  await output("ready", "true");
  await output("issue_number", request.issueNumber);
  await output("recipe_glob", `recipes/${request.issueNumber}-*`);
} catch (error) {
  const message = sanitizeText(error instanceof Error ? error.message : "Unknown preparation error", 500);
  await writeFile(path.join(contextDir, "error.txt"), `${message}\n`, { mode: 0o600 });
  await output("ready", "false");
  await output("issue_number", issueNumber);
  await output("error", message);
}
