# gtm-lead-enrichment

AI-assisted lead enrichment for go-to-market teams: Salesforce, n8n, Claude, Slack and
Snowflake.

## What this project is

When a new lead lands in Salesforce, an n8n workflow fetches the company's website and
sends it to an enrichment service. The service uses Claude to extract structured facts
about the company, checks the model's evidence against the page, and scores the lead with
deterministic rules. The lead is posted to Slack for a sales rep to approve. On approval,
Salesforce is updated. Every event lands in Snowflake, where the funnel, approval rate and
cost per lead are modeled as views.

This is a neutral portfolio project. Do not name any specific company we are applying to
anywhere in the repository.

## Architecture principles

1. **The model extracts, code decides.** Claude returns facts under a strict contract. The
   score and tier are deterministic, versioned rules in code. The model never picks a tier.
2. **Evidence is checked in code.** Every signal the model claims needs a quote that
   actually exists in the website text, or it is dropped.
3. **n8n orchestrates, the service decides.** All business logic lives in `service/`,
   which is tested. n8n only moves data between systems.
4. **Human approval is an event, not a paused execution.** The Slack click arrives at a
   separate webhook. No n8n execution waits on a human.
5. **Never overwrite human edits.** Enrichment writes only to its own custom fields.
   Standard fields are touched only on approval, only if empty, after re-reading the lead.
6. **The lead status is the queue.** See the state machine below.
7. **Raw is append-only; logic lives in views.** Nothing in Snowflake RAW is ever updated.
   Deduplication and "latest state" happen in ANALYTICS views.
8. **Model output is data, never SQL text.** Never build SQL by concatenating values.
9. **The warehouse wakes up in batches.** Events are written once per run; Slack clicks do
   not write to Snowflake.
10. **Website text is untrusted input.** It is passed to the model as delimited data,
    never as instructions.

## Layout

```
service/        Next.js app on Vercel: enrichment API and all business logic, with tests
salesforce/     SFDX project: Lead custom fields, permission set, seed data
snowflake/      SQL: setup, raw tables, analytics views, demo queries
n8n/            build script and generated workflow JSON
slack/          Slack app manifest
eval/           (stretch) golden set and results
docs/           DESIGN.md, USER_GUIDE.md, DEMO_SCRIPT.md
```

## Lead status state machine

```
Pending -> Enriching -> Awaiting_Review -> Approved | Rejected
Pending -> Enriching -> Duplicate | Failed
```

Leads left in Enriching for more than 30 minutes are picked up again.

## Enrichment API contract

`POST /api/enrich` with `Authorization: Bearer <ENRICH_API_TOKEN>`

Request:
`{ lead: { id, firstName, lastName, company, email, title?, website? }, websiteUrl?, websiteText? }`

Response 200:
`{ leadId, extraction, evidence: { kept, dropped }, score: { value, tier, reasons, rulesVersion }, usage: { model, inputTokens, outputTokens, costUsd, latencyMs } }`

Errors: 400 invalid request, 401 bad token, 422 model output failed validation after one
retry, 502 provider error.

## Code standards

- TypeScript strict; `tsc --noEmit` must pass.
- zod at every boundary: request body, model output, configuration.
- Route handlers are thin: parse, call the library, map errors. Logic lives in
  `service/src/`.
- Custom error classes, never error objects returned as values.
- vitest; the enrichment core is tested with no network.
- ESLint. No console.log in library code; use `service/src/log.ts`.
- Secrets only through environment variables; `.env.example` documents every one.

## Language

Everything in English: code, comments, commit messages, docs and Slack message text.

## Rules for you

- One task per session, one commit per task.
- Ask before adding a dependency that is not already in package.json.
- Ask before changing scoring weights or thresholds once their tests pass.
- Before any command that touches a real account (Salesforce deploy or import, Snowflake
  SQL, Vercel deploy, Slack), show me the exact command and wait for my go.
- Never write, print or commit a secret.
- Never build SQL by concatenating data. If an n8n node cannot pass values as data, stop
  and tell me.
- If a vendor API, SDK or n8n node behaves differently from what this file or the task
  describes, stop and show me what you found instead of improvising.
- Never generate placeholder implementations without telling me.