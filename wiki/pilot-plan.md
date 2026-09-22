---
summary: Recruit one API partner, study recent tickets, and test five concierge recipes before relying on automation.
tags: pilot, metrics, validation
complexity: 3
---

# Pilot plan

## Partner criteria

- Public developer documentation and an OpenAPI document
- A restricted sandbox credential and non-production API host
- At least five substantive integration questions per month
- One support reviewer willing to measure editing time and customer suitability

## Concierge sequence

1. Review 15–20 recent tickets.
2. Identify the three most repeated integration requests.
3. Generate five historical recipes with Jelwin Codex.
4. Have the support reviewer edit and run them.
5. Record whether each recipe would have been sent to the original customer.

## Gate

Continue only when at least four of five recipes run successfully, median editing is under 15 minutes, and at least three would have been sent. Otherwise revise or stop [[product-thesis]].

Use the scorecard at `research/pilot-scorecard.md`. The ticket patterns come from [[integration-patterns]] and all credential use follows [[security-model]].
