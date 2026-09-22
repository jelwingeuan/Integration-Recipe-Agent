import { access } from "node:fs/promises";
import path from "node:path";
import { findRecipeDirectory } from "./lib.mjs";

const branch = process.env.GITHUB_HEAD_REF ?? process.argv[2] ?? "";
const match = branch.match(/^recipe\/issue-(\d+)$/);
if (!match) throw new Error("Recipe validation only accepts recipe/issue-<number> branches.");
const directory = await findRecipeDirectory(path.resolve("recipes"), Number(match[1]));
await access(path.join(directory, "package.json"));
if (process.env.GITHUB_OUTPUT) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(process.env.GITHUB_OUTPUT, `recipe_dir=${path.relative(process.cwd(), directory)}\nissue_number=${match[1]}\n`, { flag: "a" });
}
console.log(path.relative(process.cwd(), directory));
