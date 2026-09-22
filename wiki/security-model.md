---
summary: Generation, repository publishing, and live sandbox execution are separate trust zones with human approval before credentials appear.
tags: security, github-actions, credentials
complexity: 4
---

# Security model

Issue bodies, documentation pages, OpenAPI descriptions, and generated files are untrusted.

The workflow separates three capabilities:

1. **Generate:** Codex receives sanitized context but no GitHub write credential and no partner sandbox key.
2. **Publish:** a clean job validates the artifact and uses the GitHub token to create or update the draft pull request.
3. **Execute:** after code review, a protected GitHub environment injects a restricted sandbox key for the smoke test.

The validator restricts output to one issue-scoped recipe directory, an approved dependency set, bounded text files, and allowlisted hosts. The live key must be short-lived or easily revocable and incapable of production access.

This model supports [[product-thesis]] without granting the generator customer-repository or production access. It follows OpenAI's guidance to constrain Codex initiators, sandbox permissions, and secret exposure in GitHub Actions.

Source: [OpenAI Codex GitHub Action](https://developers.openai.com/docs/github-action).
