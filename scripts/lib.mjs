import { lstat, mkdir, readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import path from "node:path";

const REQUIRED_FIELDS = [
  "Customer goal",
  "Documentation URLs",
  "Desired API operation",
  "Authentication method",
  "Known constraints",
  "Safe sample input",
];

export function sanitizeText(value, limit = 4_000) {
  return String(value ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, limit);
}

export function parseIssueBody(body) {
  const sections = new Map();
  let heading;
  let lines = [];

  const save = () => {
    if (heading) sections.set(heading, sanitizeText(lines.join("\n")));
  };

  for (const line of sanitizeText(body, 20_000).split(/\r?\n/)) {
    const match = line.match(/^###\s+(.+?)\s*$/);
    if (match) {
      save();
      heading = sanitizeText(match[1], 100);
      lines = [];
    } else if (heading) {
      lines.push(line);
    }
  }
  save();

  const result = {};
  for (const field of REQUIRED_FIELDS) {
    const value = sections.get(field);
    if (!value || value === "_No response_") throw new Error(`Missing required issue field: ${field}`);
    result[field] = value;
  }
  return result;
}

export function extractUrls(text) {
  return [...new Set((text.match(/https:\/\/[^\s)>\]}]+/g) ?? []).map((url) => url.replace(/[.,;:]$/, "")))].slice(0, 5);
}

export function slugify(value) {
  const slug = sanitizeText(value, 100)
    .toLowerCase()
    .replace(/^\[recipe\]\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-$/, "");
  return slug || "integration";
}

export function assertAllowedHttpsUrl(rawUrl, allowedHosts, label = "URL") {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`);
  if (!allowedHosts.includes(url.hostname)) throw new Error(`${label} host is not allowlisted: ${url.hostname}`);
  return url;
}

export function validatePartner(partner) {
  const requiredStrings = ["name", "docsUrl", "openApiUrl", "sandboxBaseUrl"];
  for (const key of requiredStrings) {
    if (typeof partner[key] !== "string" || !partner[key].trim()) throw new Error(`Partner config requires ${key}.`);
  }
  for (const key of ["allowedDocsHosts", "allowedApiHosts"]) {
    if (!Array.isArray(partner[key]) || !partner[key].length || partner[key].some((item) => typeof item !== "string")) {
      throw new Error(`Partner config requires a non-empty ${key} array.`);
    }
    if (partner[key].some((host) => host.endsWith(".invalid"))) throw new Error("Replace the example partner configuration before generating recipes.");
  }
  assertAllowedHttpsUrl(partner.docsUrl, partner.allowedDocsHosts, "Documentation URL");
  assertAllowedHttpsUrl(partner.openApiUrl, [...partner.allowedDocsHosts, ...partner.allowedApiHosts], "OpenAPI URL");
  assertAllowedHttpsUrl(partner.sandboxBaseUrl, partner.allowedApiHosts, "Sandbox base URL");
  return partner;
}

export async function fetchText(url, allowedHosts, { limit = 1_000_000, timeoutMs = 15_000 } = {}) {
  assertAllowedHttpsUrl(url, allowedHosts);
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
  if (response.status >= 300 && response.status < 400) throw new Error(`Redirects are not allowed while fetching ${url}.`);
  if (!response.ok) throw new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) throw new Error(`Source exceeds ${limit} bytes: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new Error(`Source exceeds ${limit} bytes: ${url}`);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { text, contentType: response.headers.get("content-type") ?? "text/plain" };
}

export function extractOpenApiServers(text) {
  try {
    const document = JSON.parse(text);
    return Array.isArray(document.servers) ? document.servers.map((item) => item?.url).filter(Boolean) : [];
  } catch {
    return [...text.matchAll(/^\s*-\s*url:\s*["']?([^\s"'#]+)/gm)].map((match) => match[1]);
  }
}

export async function prepareContext({ event, partner, fetcher = fetchText, contextDir }) {
  if (event.action !== "labeled" || event.label?.name !== "generate-recipe" || !event.issue || event.issue.pull_request) {
    throw new Error("This workflow only accepts issues labeled generate-recipe.");
  }
  const issueNumber = Number(event.issue.number);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error("Issue number is invalid.");

  validatePartner(partner);
  const fields = parseIssueBody(event.issue.body);
  const documentationUrls = extractUrls(fields["Documentation URLs"]);
  if (!documentationUrls.length) throw new Error("Documentation URLs must contain at least one HTTPS URL.");
  for (const url of documentationUrls) assertAllowedHttpsUrl(url, partner.allowedDocsHosts, "Issue documentation URL");

  const request = {
    issueNumber,
    title: sanitizeText(event.issue.title, 200),
    slug: slugify(event.issue.title),
    fields,
  };
  await mkdir(contextDir, { recursive: true });
  await writeFile(path.join(contextDir, "request.json"), `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
  await writeFile(path.join(contextDir, "partner.json"), `${JSON.stringify(partner, null, 2)}\n`, { mode: 0o600 });

  const sources = [partner.docsUrl, ...documentationUrls, partner.openApiUrl];
  const uniqueSources = [...new Set(sources)];
  const manifest = [];
  for (const [index, url] of uniqueSources.entries()) {
    const allowed = url === partner.openApiUrl ? [...partner.allowedDocsHosts, ...partner.allowedApiHosts] : partner.allowedDocsHosts;
    const source = await fetcher(url, allowed);
    const filename = `source-${index + 1}.txt`;
    await writeFile(path.join(contextDir, filename), source.text, { mode: 0o600 });
    manifest.push({ filename, url, contentType: source.contentType });
    if (url === partner.openApiUrl) {
      for (const serverUrl of extractOpenApiServers(source.text)) {
        const resolved = new URL(serverUrl, partner.sandboxBaseUrl).toString();
        assertAllowedHttpsUrl(resolved, partner.allowedApiHosts, "OpenAPI server URL");
      }
    }
  }
  await writeFile(path.join(contextDir, "sources.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await writeFile(
    path.join(contextDir, "pr-body.md"),
    `Generated for #${issueNumber}.\n\nStatus: **generated**. Review every file, then apply \`recipe-reviewed\`. Apply \`sandbox-approved\` only after review.\n`,
    { mode: 0o600 },
  );
  return request;
}

async function walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Generated recipes must not contain symlinks: ${absolute}`);
    if (stat.isDirectory()) files.push(...await walk(root, absolute));
    else if (stat.isFile()) files.push({ absolute, relative: path.relative(root, absolute), size: stat.size });
    else throw new Error(`Unsupported generated file type: ${absolute}`);
  }
  return files;
}

export async function findRecipeDirectory(searchRoot, issueNumber) {
  const candidates = [];
  const visit = async (directory, depth) => {
    if (depth > 2) return;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const absolute = path.join(directory, entry.name);
      if (new RegExp(`^${issueNumber}-[a-z0-9][a-z0-9-]*$`).test(entry.name)) candidates.push(absolute);
      else if (entry.name === "recipes" || depth === 0) await visit(absolute, depth + 1);
    }
  };
  await visit(searchRoot, 0);
  if (candidates.length !== 1) throw new Error(`Expected exactly one generated recipe for issue ${issueNumber}; found ${candidates.length}.`);
  return candidates[0];
}

function sameRecord(actual = {}, expected = {}) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function validateRecipeArtifact(searchRoot, issueNumber, templateRoot, partner) {
  const recipeDir = await findRecipeDirectory(searchRoot, issueNumber);
  const files = await walk(recipeDir);
  const required = ["README.md", ".env.example", "package.json", "package-lock.json", "scripts/smoke.mjs"];
  for (const name of required) {
    if (!files.some((file) => file.relative === name)) throw new Error(`Generated recipe is missing ${name}.`);
  }
  if (files.some((file) => file.size > 500_000) || files.reduce((sum, file) => sum + file.size, 0) > 1_500_000) {
    throw new Error("Generated recipe exceeds the pilot size limit.");
  }

  const generatedPackage = JSON.parse(await readFile(path.join(recipeDir, "package.json"), "utf8"));
  const templatePackage = JSON.parse(await readFile(path.join(templateRoot, "package.json"), "utf8"));
  if (!sameRecord(generatedPackage.dependencies, templatePackage.dependencies) || !sameRecord(generatedPackage.devDependencies, templatePackage.devDependencies)) {
    throw new Error("Generated recipe changed the approved dependency set.");
  }
  if (generatedPackage.scripts?.build !== "next build" || generatedPackage.scripts?.smoke !== "node scripts/smoke.mjs") {
    throw new Error("Generated recipe must retain the approved build and smoke commands.");
  }

  const allowedHosts = new Set([...partner.allowedDocsHosts, ...partner.allowedApiHosts, "nextjs.org", "localhost", "127.0.0.1"]);
  for (const file of files) {
    const content = await readFile(file.absolute);
    if (content.includes(0)) throw new Error(`Generated recipe contains a binary file: ${file.relative}`);
    if (file.relative === "package-lock.json") continue;
    const text = content.toString("utf8");
    if (/(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/.test(text) || /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text)) {
      throw new Error(`Generated recipe appears to contain a credential: ${file.relative}`);
    }
    for (const match of text.matchAll(/https?:\/\/[^\s)'"`<>]+/g)) {
      const url = new URL(match[0].replace(/[.,;:]$/, ""));
      if (!allowedHosts.has(url.hostname)) throw new Error(`Generated recipe references a non-allowlisted host: ${url.hostname}`);
    }
  }
  return recipeDir;
}

export async function acceptRecipeArtifact({ incomingRoot, repositoryRoot, issueNumber, partner }) {
  const source = await validateRecipeArtifact(incomingRoot, issueNumber, path.join(repositoryRoot, "template/nextjs"), partner);
  const recipesRoot = path.join(repositoryRoot, "recipes");
  await mkdir(recipesRoot, { recursive: true });
  for (const entry of await readdir(recipesRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(`${issueNumber}-`)) await rm(path.join(recipesRoot, entry.name), { recursive: true, force: true });
  }
  const destination = path.join(recipesRoot, path.basename(source));
  await cp(source, destination, { recursive: true, errorOnExist: false });
  return destination;
}
