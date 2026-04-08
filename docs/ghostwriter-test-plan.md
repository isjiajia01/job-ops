# Ghostwriter Test Plan

Status: active working plan  
Scope: pipeline tests, contract tests, payload normalization tests, timeline schema tests

## Goals
- Make Ghostwriter safe to refactor without relying on manual UI checks.
- Lock the server/client contract around runtime events and payloads.
- Catch LLM-shape drift without breaking the product.
- Give future Rust extraction candidates a stable contract baseline.

---

## Test pyramid for Ghostwriter

### Layer 1 — focused pure/service tests
Purpose:
- ranking
- diagnostics mapping
- payload normalization
- reviewer/editor heuristics

Primary files:
- `ghostwriter-reviewer.ts`
- `ghostwriter-output-guard.ts`
- `ghostwriter-diagnostics.ts`
- `shared/src/utils/ghostwriter.ts`

### Layer 2 — pipeline tests
Purpose:
- run the full Ghostwriter server chain with mocked LLM results
- verify stage ordering and final payload outcomes

Primary file:
- `workspace/src/server/services/ghostwriter.test.ts`

### Layer 3 — contract tests
Purpose:
- guarantee API/SSE/timeline shape stability

Primary files:
- `workspace/src/server/api/routes/ghostwriter.test.ts`
- new contract-focused timeline/payload tests

### Layer 4 — UI schema consumption tests
Purpose:
- ensure Runtime Inspector and Run Timeline remain exhaustive and compatible with typed event payloads

Primary files:
- `RuntimeInspector.test.tsx`
- `RunTimeline.test.tsx`
- `MessageList.test.tsx`

---

## Workstream A — Pipeline test matrix

### A1. Happy-path drafting
#### Case: cover letter, no clarification
Validate:
- strategy built
- evidence selected
- claim plan built
- variants generated
- one winner selected
- no rewrite required or one rewrite path works
- final payload contains cover letter draft

### A2. Editorial rewrite path
#### Case: winner draft is generic / AI-like
Validate:
- `editorial_rewrite_requested` emitted
- trigger reasons included
- diagnostics + diagnostic summary included
- rewritten payload preserves evidence / claim plan

### A3. Reviewer rewrite path
#### Case: post-generation review flags weak draft
Validate:
- `review_completed` shows low/medium quality
- `review_rewrite_requested` emitted
- second rewrite applied
- final review updated

### A4. Evidence-boundary penalty path
#### Case: variant references unapproved evidence
Validate:
- ranking penalties include boundary violations
- diagnostics include `evidence-boundary`
- winning variant is not the violating candidate

### A5. Claim-coverage miss path
#### Case: must-claim omitted
Validate:
- ranking penalties contain `missed-must-claim:*`
- reviewer issues include `weak-claim-coverage`
- diagnostic summary reflects claim-coverage risk

### A6. Clarification path
#### Case: strategy says clarification is required
Validate:
- no variants generated
- response is numbered clarifying questions
- `claimPlan` is still attached if intended

---

## Workstream B — Contract tests

### B1. SSE event contract
Test all stream event shapes:
- `ready`
- `delta`
- `timeline`
- `completed`
- `error`

### B2. Timeline event payload contract
For each high-value event type validate exact payload shape:
- `variant_scored`
- `editorial_rewrite_requested`
- `review_completed`
- `review_rewrite_requested`
- `selection`

### B3. Run persistence + replay contract
Validate:
- run event persists to DB
- event can be fetched through list endpoint
- fetched payload retains typed shape

---

## Workstream C — Payload normalization tests

### C1. Good payloads
- full structured payload
- null-heavy payload
- direct reply payload
- cover-letter payload
- resume patch payload

### C2. Loose/legacy payloads
- missing optional fields
- wrong-but-salvageable field names
- nested arrays with junk values
- diagnostics present, summary missing
- summary present, diagnostics missing

### C3. Invalid payloads
- impossible enum values
- malformed diagnostics
- malformed summary counts
- malformed claim plan priorities

**Goal**
- normalization should salvage safe content where possible
- invalid structures should be dropped, not poison the whole response

---

## Workstream D — Timeline/UI schema tests

### D1. Exhaustive event rendering
Ensure `RunTimeline` handles all event types via exhaustive switch.

### D2. Summary rendering
Ensure timeline and runtime inspector render:
- `diagnosticSummary`
- raw diagnostics
- missing-summary fallback behavior

### D3. Selection explanation rendering
Ensure final selection card still renders when only summary-level data is present.

---

## Fixtures and helpers to add

### Recommended factory modules
```text
workspace/src/server/services/__tests__/fixtures/
  ghostwriter-runtime.ts
  ghostwriter-payload.ts
  ghostwriter-events.ts
```

### Suggested builders
- `makeStrategyResult(...)`
- `makeEvidenceSelectionResult(...)`
- `makeVariantPayload(...)`
- `makeReviewResult(...)`
- `makeDiagnostic(...)`
- `makeTimelineEvent(...)`

Benefit:
- shorter tests
- less brittle JSON duplication
- easier future contract evolution

---

## Test execution plan

### Immediate additions
- [ ] add dedicated `ghostwriter-diagnostics.test.ts`
- [ ] add payload normalization compatibility tests for diagnostics summaries
- [ ] add pipeline case for reviewer rewrite path
- [ ] add pipeline case for evidence-boundary penalties
- [ ] add API/timeline contract assertions for `diagnosticSummary`

### Near-term additions
- [ ] add runner-up/discarded variant explanation tests once selection diagnostics are surfaced
- [ ] add regression tests for Safari-safe output formatting whenever markdown/output formatting changes

---

## Definition of “90% complete” for Priority 2
- Core Ghostwriter paths are covered by pipeline tests.
- Typed timeline payloads are contract-tested.
- Payload normalization is tested against loose and malformed LLM outputs.
- Runtime inspector and timeline tests explicitly cover diagnostics summaries.
- Refactors in planning/generation/finalize do not require blind manual regression checks.
