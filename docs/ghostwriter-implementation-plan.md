# Ghostwriter Implementation Plan

Status: active working plan  
Scope: server pipeline structure, shared type boundaries, diagnostics consolidation, runtime explainability

## Goals
- Keep `job-ops` fast to iterate in TypeScript while reducing Ghostwriter complexity.
- Move Ghostwriter from a large orchestration file into stable module boundaries.
- Make runtime behavior explainable enough that product decisions can be debugged without reading raw prompts or logs.
- Prepare the codebase for stronger tests and only-later selective Rust extraction.

## Current state snapshot
- `workspace/src/server/services/ghostwriter.ts` already has first-pass separation of planning / generation / finalize stages.
- Diagnostics are now first-class and shared through `ghostwriter-diagnostics.ts`.
- Runtime timeline events are persisted and typed.
- Runtime inspector and timeline consume structured runtime/review/diagnostic information.
- Remaining risk: important logic is still concentrated in a few files and the shared type surface is still too broad.

---

## Workstream A — Server pipeline boundaries

### Target module shape
```text
workspace/src/server/services/ghostwriter/
  index.ts
  runtime/
    routing.ts
    context.ts
    base-messages.ts
    timeline.ts
  planning/
    strategy.ts
    evidence-selection.ts
    claim-plan.ts
  generation/
    variants.ts
    ranking.ts
    output-guard.ts
  finalize/
    editorial.ts
    reviewer.ts
    rewrite-loop.ts
    diagnostics.ts
  payload/
    normalize.ts
    finalize-payload.ts
    selection-meta.ts
```

### Migration order

#### Phase A1 — thin wrapper extraction
Move the new helper stages out of `ghostwriter.ts` without changing behavior:
- `buildWritingPlan(...)`
- `generateStructuredCandidates(...)`
- `runEditorialRewriteStage(...)`
- `runReviewerStage(...)`
- `finalizeStructuredPayload(...)`

**Exit criteria**
- `ghostwriter.ts` becomes a shell/orchestrator file.
- No event payload behavior changes.
- Existing Ghostwriter service tests pass unchanged.

#### Phase A2 — runtime/timeline split
Extract runtime-only concerns:
- `buildBaseLlmMessages(...)`
- `emitRunTimelineEvent(...)`
- timeline payload builders
- selection summary builders

**Exit criteria**
- Runtime event schemas are constructed in one place.
- Service flow no longer manually assembles timeline payloads inline across stages.

#### Phase A3 — payload and selection split
Extract:
- payload attachment helpers (`review`, `diagnosticSummary`, runtime data)
- candidate selection metadata / final selection builder
- final payload serialization boundary

**Exit criteria**
- reviewer/editor/generation stages return domain objects, not ad hoc UI-ready payload fragments.
- final selection logic is unit-testable without invoking the whole run shell.

---

## Workstream B — Shared type convergence

### Problem
`shared/src/types/chat.ts` currently holds:
- message/run/thread types
- assistant payload types
- diagnostics types
- timeline event types

That file is still a high-coupling hotspot.

### Target split
```text
shared/src/types/chat/
  messages.ts
  runs.ts
  payload.ts
  diagnostics.ts
  timeline.ts
  index.ts
```

### Migration order

#### Phase B1 — diagnostics extraction
Move to `shared/src/types/chat/diagnostics.ts`:
- `GhostwriterDiagnostic`
- `GhostwriterDiagnosticSummaryItem`

#### Phase B2 — payload extraction
Move to `shared/src/types/chat/payload.ts`:
- `GhostwriterAssistantPayload`
- `GhostwriterReviewSummary`
- `GhostwriterFitBrief`
- `GhostwriterEvidenceSelectionSummary`
- `GhostwriterClaimPlan`

#### Phase B3 — timeline extraction
Move to `shared/src/types/chat/timeline.ts`:
- `JobChatRunPhase`
- `JobChatRunEventPayloadByType`
- `JobChatRunEventType`
- `JobChatRunEvent`

**Exit criteria**
- Timeline changes do not require opening payload definitions.
- Payload changes do not require touching thread/run definitions.
- Shared imports become more specific and easier to audit.

---

## Workstream C — Diagnostics system hardening

### Current state
Diagnostics mapping is centralized, normalized, and summarized.

### Remaining work
#### C1 — canonical code registry
Create and document a stable code vocabulary:
- `generic-language:*`
- `generic-opening`
- `long-sentences:*`
- `dense-sentence-flow`
- `repetitive-openers:*`
- `weak-claim-coverage`
- `thin-evidence-signal`
- `high-risk-language`
- `missed-must-claim:*`
- `excluded-claim:*`
- `unapproved-evidence-ids:*`
- `possible-unapproved-projects:*`
- `weak-role-rubric:*`
- `overpacked-fit-language:*`

#### C2 — summary policy
Server should provide three layers consistently:
1. raw issue codes
2. normalized diagnostics
3. grouped summaries

#### C3 — top blocker extraction
Add helper outputs for:
- highest severity blockers
- top discarded-variant blocker reasons
- remaining winner risks

**Exit criteria**
- UI never needs to derive semantic categories from raw strings.
- timeline / inspector / future analytics all consume the same summary policy.

---

## Workstream D — Runtime explainability

### Product additions
#### D1 — decision summary block
For selected winner:
- winner variant
- winner reason
- strongest evidence carried forward
- remaining risk summary

#### D2 — discarded variant explanation
For runner-up / loser variants:
- score summary
- top penalties
- top blocker diagnostics

#### D3 — phase-level summaries
Display compact summaries for:
- planning
- generation
- finalize

**Exit criteria**
- A product/operator can answer “why this draft won” without reading raw JSON.
- A weak draft can be diagnosed from runtime inspector alone.

---

## Milestones

### Milestone 1 — 70% structural cleanup
- `ghostwriter.ts` becomes an orchestration shell
- diagnostics code registry documented
- shared diagnostics/payload/timeline types split

### Milestone 2 — 85% runtime explainability
- selection and discarded-variant explanations surfaced
- timeline payloads all server-authored and summary-rich

### Milestone 3 — 90% maintainability target
- pipeline stages independently testable
- shared types split complete
- diagnostics duplication nearly eliminated

---

## Definition of “90% complete” for Priority 1
- `ghostwriter.ts` is no longer the main implementation container.
- diagnostics mapping and summaries are centralized.
- shared types are split by concern.
- runtime inspector/timeline use server-authored explanations.
- remaining work is mostly polish and new feature iteration, not architectural untangling.
