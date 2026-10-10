import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

function parseJobs(workflow) {
  const jobsSection = workflow.split(/^jobs:\s*$/m)[1];
  assert.ok(jobsSection, "workflow must define jobs");
  const jobs = new Map();
  let current;
  for (const line of jobsSection.split("\n")) {
    const match = line.match(/^  ([a-z][a-z-]*):\s*$/);
    if (match) {
      current = match[1];
      jobs.set(current, "");
    } else if (current) {
      jobs.set(current, `${jobs.get(current)}\n${line}`);
    }
  }
  return jobs;
}

function jobPermissions(job) {
  const match = job.match(/^    permissions:\n((?:      [^\n]*\n)+)/m);
  assert.ok(match, "job must declare permissions");
  return match[1].trim().split("\n").map((line) => line.trim());
}

test("generated code runs without GitHub write credentials", async () => {
  const workflow = await readFile(new URL("../.github/workflows/validate-recipe.yml", import.meta.url), "utf8");
  const jobs = parseJobs(workflow);

  for (const name of ["build", "live-sandbox"]) {
    const job = jobs.get(name);
    assert.ok(job, `missing ${name} job`);
    assert.deepEqual(jobPermissions(job), ["contents: read"]);
    assert.match(job, /persist-credentials: false/);
  }
  assert.doesNotMatch(jobs.get("build"), /secrets\./);
  assert.match(jobs.get("live-sandbox"), /secrets\.PARTNER_SANDBOX_API_KEY/);

  const writeJobs = [...jobs].filter(([, job]) => jobPermissions(job).some((permission) => permission.endsWith(": write"))).map(([name]) => name).sort();
  assert.deepEqual(writeJobs, ["record-build-status", "record-live-status"]);
  for (const name of writeJobs) {
    assert.deepEqual(jobPermissions(jobs.get(name)), ["issues: write"]);
    assert.doesNotMatch(jobs.get(name), /actions\/checkout|npm (?:ci|run)|node scripts\/|secrets\./);
  }

  assert.match(jobs.get("build"), /recipe-reviewed/);
  assert.match(jobs.get("live-sandbox"), /sandbox-approved/);
  assert.match(jobs.get("live-sandbox"), /environment: recipe-sandbox/);
  assert.match(jobs.get("record-live-status"), /needs\.build\.result == 'success'/);
});

test("generation validates artifacts before a checkout-free publish job", async () => {
  const workflow = await readFile(new URL("../.github/workflows/generate-recipe.yml", import.meta.url), "utf8");
  const jobs = parseJobs(workflow);

  for (const name of ["prepare", "generate", "validate-artifact"]) {
    assert.deepEqual(jobPermissions(jobs.get(name)), ["contents: read"]);
    assert.match(jobs.get(name), /actions\/checkout@v5[\s\S]*?persist-credentials: false/);
  }
  for (const name of ["prepare", "validate-artifact"]) assert.doesNotMatch(jobs.get(name), /secrets\./);
  assert.deepEqual(jobPermissions(jobs.get("needs-input")), ["issues: write"]);
  assert.deepEqual(jobPermissions(jobs.get("publish")), ["contents: write", "issues: write", "pull-requests: write"]);
  for (const name of ["needs-input", "publish"]) {
    assert.doesNotMatch(jobs.get(name), /actions\/checkout|npm (?:ci|run)|node scripts\/|secrets\./);
  }
  assert.match(jobs.get("generate"), /secrets\.OPENAI_API_KEY/);
  assert.match(jobs.get("validate-artifact"), /needs: \[prepare, generate\]/);
  assert.match(jobs.get("validate-artifact"), /node scripts\/accept-artifact\.mjs/);
  assert.match(jobs.get("validate-artifact"), /name: accepted-recipe-/);
  assert.match(jobs.get("publish"), /needs: \[prepare, validate-artifact\]/);
  assert.match(jobs.get("publish"), /name: accepted-recipe-/);
  assert.match(jobs.get("publish"), /GITHUB_SHA: baseSha/);

  const inlineScript = jobs.get("publish").match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n          NODE/);
  assert.ok(inlineScript, "publish must use trusted inline code");
  const check = spawnSync(process.execPath, ["--check", "--input-type=module"], {
    input: inlineScript[1].replace(/^          /gm, ""),
    encoding: "utf8",
  });
  assert.equal(check.status, 0, check.stderr);
});
