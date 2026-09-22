---
summary: The pilot should sample common API workflows without expanding into a general integration platform.
tags: api, recipes, patterns
complexity: 3
---

# Integration patterns

The ticket review should classify requests into a small set of recurring patterns:

- Authenticated REST read
- Authenticated REST write
- Pagination
- Webhook receipt and signature handling
- Documented error handling
- Framework-specific server route

These categories guide ticket sampling; they are not six product modules. Each generated recipe implements only one requested operation and uses the partner's documented contract.

Patterns seen repeatedly in the partner's tickets feed [[pilot-plan]]. Missing or contradictory source material is handled according to [[security-model]] rather than guessed.
