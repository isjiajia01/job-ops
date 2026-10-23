# AGENTS.md

Repository-local guidance for AI coding agents working in `11.01_job-ops`.
This file is uncommitted in the working tree on purpose — see "Uncommitted state" at the end.

This document has two parts:

1. **Repository and workflow guidance** (this part) — project identity, structure, Git safety,
   build/test gates, dependency policy, and the definition of done.
2. **Preserved project standards** (lower part) — the previously existing error/logging/
   sanitization, SSE, redaction, webhook, documentation, and Ghostwriter standards, plus the
   CI-parity validation list, kept verbatim apart from heading depth. Those are still binding.

## Project

`job-ops` is a job-application operations platform: it turns job postings and candidate
profiles into tailored application material through a pipeline of extractors, an
evidence-mapping / ghostwriter stage, and a supporting web workspace plus documentation site.

It is a **fork**: `origin` is `isjiajia01/job-ops` and `upstream` is `DaKheera47/job-ops`.
That single fact drives most of the Git rules below.

## Tech Stack (verified)

- TypeScript across an npm-workspaces monorepo: `workspace`, `docs-site`, `extractors/*`,
  `shared`.
- Next.js client build inside `workspace`; Prisma; Docker (`Dockerfile`, `Dockerfile.base`,
  `docker-compose.yml`); Docusaurus-style documentation site in `docs-site`.
- Tooling: Biome (`biome.json`) for lint/format, `knip` for dead-code detection,
  `tsx` for scripts, volta-pinned Node `22.22.1`. CI runs on Node 22.
- Repository metadata folders `.claude/`, `.codex/`, `.opencode/` hold agent/tooling config —
  do not modify them as part of unrelated work.

## Repository Structure

```text
workspace/          main application (server, client, infra, tests)
docs-site/          documentation site workspace
extractors/*        per-source extraction packages (adzuna, gradcracker, hiringcafe,
                    startupjobs, ukvisajobs, jobspy, ...)
shared/             shared types and utilities workspace
scripts/            repo-level build, versioning, eval, and seed scripts
docs/               project documentation
visa-sponsor-providers/
Dockerfile.base, Dockerfile, docker-compose.yml
biome.json, knip.json, package.json, skills-lock.json
```

## Architecture

- Server code lives under `workspace/src/server/`, client code under
  `workspace/src/client/`. `infra/` holds the shared logger; `workspace/src/server/infra/sse.ts`
  and `workspace/src/client/lib/sse.ts` hold the SSE transport helpers.
- Extraction is per-source and isolated: each `extractors/<source>` package owns its own
  scraping/parsing and type-check script. Add a new source as a new package, not as a branch
  inside an existing one.
- The pipeline is long-running and observable. Correlation IDs (`requestId`, `pipelineRunId`,
  `jobId`) must survive across async boundaries — see the preserved standards below.
- The documented conventions in the preserved section are contract-level. Follow them or
  propose a change; do not silently diverge.

## Build and Verification

Run from the repository root. The full CI-parity list is in the preserved section below; the
short form:

```bash
npm run check:all          # biome ci .
npm run check:types        # shared + workspace
npm run test:all           # workspace test:run
npm run build:extractors
```

Notes:

- Node 22 is the supported runtime (volta pin + CI). If behaviour differs locally, verify on
  Node 22 before concluding a change is correct.
- If tests fail with a `better-sqlite3` Node ABI mismatch, rebuild it:
  `npm --workspace workspace rebuild better-sqlite3`.
- Run targeted tests first for a focused change, then the full CI-parity list. A change is
  valid only when the required checks pass with no ignored failures.
- `npm run knip` is advisory housekeeping, not a gate; do not delete code it flags without
  confirming the code is genuinely unreachable.

## Git Safety

- Branches present: `main` (default, `origin/HEAD -> origin/main`), `deploy/refine-ghostwriter-profilehub`,
  and the current working branch `pr/refine-ghostwriter-profilehub`, which is ~47 commits ahead
  of `origin/main` and tracks `origin/pr/refine-ghostwriter-profilehub`.
- Before editing: `git branch --show-current`, `git status --short`, and
  `git rev-list --left-right --count origin/main...HEAD` if you need to know how far ahead you are.
- **Never develop on `main`.** If asked to make a change, work on a task branch
  (`feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`).
- **Never push to `upstream`.** `upstream` is a third-party project; treating it as writable
  would be both wrong and harmful. Fetch-only, read-only, always.
- **Never push to `origin/main`, never merge into `main`, never force push, never rewrite
  history, never amend an existing commit.** Finishing work is not permission to merge.
- **Do not push at all** unless the user explicitly asks. A local commit plus a clear report
  is the expected end state.
- **Never `git add -A` / `git add .`.** The working tree currently contains ~25 deleted
  `.agents/skills/**` files and 8 untracked files (`docs/private-pilot-*.md`,
  `scripts/seed-pilot-demo.ts`, ...) that are the owner's in-flight work.
- Preserve every unrelated pending change exactly. Do not stash, revert, or 'clean' them.
  Never `git reset --hard`, `git clean -fd`, `git checkout -- .`, or `git restore .`.

## Project-Specific Rules

- **Fork discipline**: a change intended for upstream must be a minimal, reviewable diff on a
  fresh branch off `upstream/main`, with no local-only files (pilot docs, seed scripts, agent
  config) included. Do not mix local product work into an upstream PR.
- The pending `.agents/skills/**` deletions are deliberate in-flight work. Do not restore them
  and do not commit the deletion unless asked.
- `.env` at the repository root holds local configuration and is correctly covered by
  `.gitignore`. Never commit it, never print its contents, and never let a blanket
  `git add` pull it in. `.env.example` is the only tracked environment file.
- Secrets, provider API keys, and database URLs belong in environment variables. Never inline
  them into code, tests, fixtures, or documentation.
- `visa-sponsor-providers/` and the extractor packages encode source-specific behaviour. A
  change to one source must not change the shared pipeline's semantics for the others.
- Do not add a new top-level workspace or change the workspace list in `package.json` without
  a task that requires it.

## Dependencies

- `package-lock.json` is committed. Do not modify it unless the task requires a dependency change.
- Prefer existing workspaces and shared modules over adding a package.
- Do not perform broad upgrades of Next, React, Prisma, TypeScript, or Biome; the monorepo has
  several coupled packages.
- Adding a dependency to `shared` or `workspace` affects every extractor — justify it.

## Safety

- Never commit secrets. If a secret is already tracked, report the file path without
  reproducing the value.
- Do not run `docker compose up` against anything but a local database, and do not run
  database migrations or seeds against a real environment.
- Do not deploy, publish, or push to any registry without explicit authorization.
- Extraction packages make outbound network calls to third-party job boards. Keep request
  volume bounded and respect each site's terms; do not bypass rate limits or auth.

## Definition of Done

- you are on a task branch (not `main`), and `git status` / `git diff` show only intended files;
- the CI-parity checks that apply to your change passed, with the exact commands and results
  reported (see the preserved validation list below);
- targeted tests were run before the full list;
- no unrelated file changed, and the pre-existing deletions/untracked files were left alone;
- no secret appears in the diff;
- nothing was committed to `main`, merged, or pushed;
- state explicitly what was not run and why.

## Handoff

- **Completed** — what changed and why.
- **Validation** — exact commands and results; note anything that could not run (e.g. a
  database-dependent test).
- **Git** — branch, commit status, and whether anything is pushed.
- **Files changed** — important paths.
- **Remaining issues** — pending deletions, untracked pilot work, known failing checks.
- **Next action** — whether this is ready for owner review, or for an upstream PR.

Never report "done" because code was written. Green requires a command that actually ran.

---

*The section below is the repository's previously existing `AGENTS.md`, preserved verbatim
apart from heading depth. It remains binding.*

## Error/Logging/Sanitization Standards

This project uses strict operability and privacy defaults for server-side code.

### API Response Contract

For all `/api/*` routes, return:

- Success: `{ ok: true, data, meta?: { requestId } }`
- Error: `{ ok: false, error: { code, message, details? }, meta: { requestId } }`

Use consistent status/code mapping:

- `400 INVALID_REQUEST`
- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `408 REQUEST_TIMEOUT`
- `409 CONFLICT`
- `422 UNPROCESSABLE_ENTITY`
- `500 INTERNAL_ERROR`
- `502 UPSTREAM_ERROR`
- `503 SERVICE_UNAVAILABLE`

### Correlation IDs

- Honor inbound `x-request-id` when present; otherwise generate one.
- Always return `x-request-id` header.
- Include request ID in API responses (`meta.requestId`) and logs.
- Propagate context into async flows (especially pipeline run and per-job work) so logs include `pipelineRunId` / `jobId` when available.

### Logging Rules

- Use the shared logger wrapper (`infra/logger.ts`) in core server paths.
- Do not add direct `console.log`, `console.warn`, or `console.error` in core paths.
- Log structured objects, not free-form dumps.
- Include useful context fields (e.g. `requestId`, `pipelineRunId`, `jobId`, `route`, `status`).

### SSE Standards

- Use centralized SSE helpers by default.
- Server: use `workspace/src/server/infra/sse.ts` for setup, data writes, comments, and heartbeats.
- Client (`EventSource`): use `workspace/src/client/lib/sse.ts` for subscription/open/message/error plumbing.
- Do not duplicate raw SSE setup (`Content-Type`, `Connection`, heartbeat loops, or ad-hoc `JSON.parse` event parsing) when these helpers apply.
- Keep feature payload types domain-local (pipeline, ghostwriter, bulk actions), but reuse shared transport plumbing.

### Redaction and Sanitization

- Always sanitize objects before logging or returning in error `details`.
- Redact sensitive keys by default (`authorization`, `cookie`, `password`, `secret`, `token`, `apiKey`, etc.).
- Truncate large payloads and long strings.
- Do not throw/log raw upstream response bodies, full webhook bodies, or large `JSON.stringify(...)` blobs.

### Webhook and LLM Payload Defaults

- Webhooks: send minimal whitelisted payloads by default.
- LLM prompts: send only required profile/job fields; avoid unnecessary PII.
- Document external payload behavior when adding new integrations.

### PR Checklist (Routes/Services)

- API responses follow `{ ok, data/error, meta.requestId }`.
- Status/code mapping is correct and consistent.
- Request/correlation IDs appear in logs and async workflows.
- No raw sensitive payload logging or raw upstream body throws.
- New/changed webhook or LLM payloads are sanitized and documented.

### Documentation Standards (Condensed)

When adding or updating user-facing docs:

- Use this feature-page structure:
  1. **What it is**
  2. **Why it exists**
  3. **How to use it**
  4. **Common problems**
  5. **Related pages**
- Include frontmatter keys: `id`, `title`, `description`, `sidebar_position`.
- Prefer concrete, step-by-step instructions over abstract explanation.
- Include copy-pasteable examples where relevant.
- State defaults and constraints explicitly.
- Link related docs with `/docs/...` URLs.
- Any user-visible behavior change should include corresponding docs updates.

### Ghostwriter personalization workflow

When improving Ghostwriter quality for a real candidate, prefer this loop over prompt-only tweaking:

1. Seed or update `Profile Hub` / `candidateKnowledgeBase` with:
   - personal facts
   - strongest project evidence
   - durable writing preferences
2. Test on a real target application, not an abstract sample prompt.
3. Review output for:
   - generic openings
   - weak evidence selection
   - wrong tone / country style / overclaiming
4. Convert repeated failures into durable profile memory instead of one-off prompt hacks.
5. Re-run on the same application and only then generalize changes.

Favor durable memory + prompt/rule improvements over per-run manual prompting whenever the issue is recurring.

### Validation / Verification

Before marking work complete, verify changes with the same checks used by CI.

#### Required CI-parity checks

Run from repository root:

1. `./workspace/node_modules/.bin/biome ci .`
2. `npm run check:types:shared`
3. `npm --workspace workspace run check:types`
4. `npm --workspace gradcracker-extractor run check:types`
5. `npm --workspace ukvisajobs-extractor run check:types`
6. `npm --workspace workspace run build:client`
7. `npm --workspace workspace run test:run`

#### Native module note (better-sqlite3)

If tests fail with a Node ABI mismatch for `better-sqlite3`, rebuild it before running tests:

- `npm --workspace workspace rebuild better-sqlite3`

CI runs on Node 22. If local behavior differs, verify with Node 22 before concluding a change is valid.

#### Scope-specific checks

- For focused changes, run targeted tests first (for touched files/modules), then still run the full CI-parity list above before finalizing.
- A change is considered valid only when all required checks pass without ignored failures.

---

## Uncommitted state

This file was written into the working tree **without** switching branches and **without**
committing, because the repository already had ~43 uncommitted entries of in-flight work on
`pr/refine-ghostwriter-profilehub`. It modifies a tracked file; the previous version is
recoverable with `git show HEAD:AGENTS.md`
(sha256 `b21bc45278f8f615c2f7cbf04cb82f98f53f049f08264da7b68f60c45a033f1b`).
Commit it on a task branch.
