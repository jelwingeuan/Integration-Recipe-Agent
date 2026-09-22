import { readFile } from "node:fs/promises";
import path from "node:path";
import { acceptRecipeArtifact, validatePartner } from "./lib.mjs";

const [incoming = "incoming", issueArg] = process.argv.slice(2);
const issueNumber = Number(issueArg);
if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error("Usage: node scripts/accept-artifact.mjs <incoming-dir> <issue-number>");

const repositoryRoot = process.cwd();
const partner = validatePartner(JSON.parse(await readFile(path.join(repositoryRoot, ".github/recipe-agent/partner.json"), "utf8")));
const destination = await acceptRecipeArtifact({ incomingRoot: path.resolve(incoming), repositoryRoot, issueNumber, partner });

if (process.env.GITHUB_OUTPUT) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(process.env.GITHUB_OUTPUT, `recipe_dir=${path.relative(repositoryRoot, destination)}\n`, { flag: "a" });
}
console.log(path.relative(repositoryRoot, destination));
