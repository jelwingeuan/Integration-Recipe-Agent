# Integration Recipe Agent

An intentionally small pilot for API/SDK support teams. A trusted support agent labels a structured GitHub issue with `generate-recipe`; Codex creates a customer-specific Next.js/TypeScript example as a draft pull request.

## Current status

The local automation and research knowledge base are implemented. A real partner, its support tickets, documentation/OpenAPI URLs, restricted sandbox credential, and pilot results are still required. Nothing here claims customer validation.

## Repository workflow

1. Copy `.github/recipe-agent/partner.example.json` to `.github/recipe-agent/partner.json` and replace every placeholder.
2. Configure the `OPENAI_API_KEY` repository secret.
3. Create the `recipe-sandbox` GitHub environment with required reviewers, `PARTNER_SANDBOX_API_KEY`, and `PARTNER_API_BASE_URL`.
4. Open an issue using the Integration Recipe form and apply `generate-recipe` as a trusted collaborator.
5. Review the generated draft PR. Apply `recipe-reviewed` to run its dependency install and build.
6. Apply `sandbox-approved` only after inspecting the recipe. The protected environment then requests approval before the live smoke test receives credentials.

Reapplying `generate-recipe` intentionally replaces the automation-owned `recipe/issue-<number>` branch from the trusted default branch. Do not relabel after beginning manual edits; request a fresh generation first, then review and edit that result.

The generation job has no repository write token and no sandbox credential. A separate job validates generated paths, file sizes, required files, scripts, symlinks, and obvious secret material before publishing the PR.

## Local checks

```sh
npm test
npm run check
```

The automation uses Node's standard library. The generated Next.js template owns its own dependencies.

## Pilot gate

Recruit one API/SDK partner, review 15–20 tickets, and manually run five historical requests before treating the workflow as validated. Continue only if four recipes run, median editing stays below 15 minutes, and support would have sent at least three to the original customer.
