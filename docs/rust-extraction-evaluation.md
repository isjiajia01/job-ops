# Rust Extraction Evaluation

Status: future-facing plan  
Scope: selective Rust adoption only where it creates real leverage

## Core rule
Do **not** rewrite the whole product in Rust.
Use Rust only for narrow modules that satisfy all three conditions:
1. stable boundary
2. measurable gain
3. minimal interruption to TS product iteration

---

## Decision rubric

### A module is a Rust candidate only if:
- It is CPU-heavy, parser-heavy, or large-scale retrieval-heavy.
- Its input/output contract can be reduced to a clean JSON boundary.
- It does not need constant UI/product iteration.
- It can be developed as a sidecar/CLI/service without forcing a frontend/backend rewrite.

### A module should stay in TypeScript if:
- It is product workflow logic.
- It changes weekly based on experimentation.
- It is dominated by LLM latency rather than compute.
- It mainly coordinates DB/API/UI interactions.

---

## Module-by-module evaluation

### 1. Ghostwriter orchestration
Current location examples:
- `workspace/src/server/services/ghostwriter.ts`
- planning/finalize/ranking layers around it

**Recommendation:** stay in TypeScript  
**Reason:** this is product logic, prompt orchestration, workflow control, and contract evolution.

### 2. Runtime inspector / timeline UI
Current location examples:
- `workspace/src/client/components/ghostwriter/RuntimeInspector.tsx`
- `RunTimeline.tsx`

**Recommendation:** stay in TypeScript  
**Reason:** pure UI/product layer.

### 3. Diagnostics mapping and review heuristics
Current location examples:
- `ghostwriter-diagnostics.ts`
- `ghostwriter-reviewer.ts`
- `ghostwriter-output-guard.ts`

**Recommendation:** stay in TypeScript for now; maybe partial Rust later only if scoring becomes significantly heavier.  
**Reason:** still changing fast; correctness and explainability matter more than micro-performance.

### 4. Local project scanning / repository ingestion
Current location examples:
- `candidate-knowledge.ts`
- future project-source scanners
- any README / manifest / code tree extraction

**Recommendation:** strong future Rust candidate  
**Reason:** parser-heavy, filesystem-heavy, and naturally separable.

**Good target form:**
- Rust CLI or sidecar service
- TS sends path list and receives normalized project candidates

### 5. Evidence retrieval / local search / reranking engine
Current location examples:
- future semantic retrieval layer for Ghostwriter knowledge and project materials

**Recommendation:** strong future Rust candidate  
**Reason:** if this grows into vector search, indexing, and heuristic reranking, Rust can help performance and packaging.

### 6. PDF / DOCX / OCR parsing pipeline
Current location examples:
- `pdf.ts`
- profile/document ingest flows

**Recommendation:** strong future Rust candidate  
**Reason:** parser-heavy, binary-heavy, and ideal for sidecar packaging.

### 7. Job dedupe / scorer / bulk ETL logic
Current location examples:
- `job-dedupe.ts`
- `scorer.ts`
- pipeline transforms

**Recommendation:** maybe later  
**Reason:** only worth it if profiling shows real bottlenecks or if a reusable engine emerges.

---

## Recommended extraction order

### Phase R1 — no Rust yet, prepare boundaries in TS
Before writing any Rust:
- isolate parser-friendly modules behind service interfaces
- define JSON-safe request/response schemas
- remove hidden coupling to DB/UI state

### Phase R2 — first Rust pilot
**Best first pilot:** local project scanner / ingest engine

Why this is the best first pilot:
- clear I/O boundary
- measurable filesystem/parsing workload
- low product risk
- easy fallback to TS implementation

### Phase R3 — second Rust pilot if needed
**Likely next:** evidence retrieval / reranking engine

Only do this after:
- retrieval design stabilizes
- ranking inputs/outputs are already typed and test-covered

---

## Sidecar architecture recommendation

### Preferred shape
```text
TS app (main product shell)
  -> JSON request
  -> Rust sidecar (CLI or local service)
  -> JSON response
```

### Avoid
- embedding Rust into the core web app too early
- replacing API/DB/UI layers with Rust
- mixing fast-changing product logic with systems-level code

---

## What to measure before writing Rust

For each candidate module, capture:
- current latency / throughput
- memory usage or CPU hotspots
- frequency of product-rule changes
- boundary clarity
- fallback difficulty

If you cannot show a meaningful benefit on these dimensions, do not extract yet.

---

## 90% completion definition for Priority 3
This priority is not about writing Rust immediately. It is about being ready to make a smart extraction later.

A 90% complete readiness state means:
- Rust-worthy modules are identified and ranked.
- TS boundaries are already clear enough to extract one module without refactoring the whole app.
- JSON contracts for the first pilot are known.
- The first pilot choice is documented and low-risk.
- The main app remains TypeScript-first.

---

## Recommended first Rust pilot spec

### Candidate
Local project scanning / candidate project extraction

### Input contract
```json
{
  "roots": ["/path/a", "/path/b"],
  "maxDepth": 4,
  "includePatterns": ["README*", "package.json", "pyproject.toml", "Cargo.toml"]
}
```

### Output contract
```json
{
  "projects": [
    {
      "id": "...",
      "name": "...",
      "path": "...",
      "signals": ["readme", "package-json"],
      "summary": "...",
      "keywords": ["..."],
      "confidence": "medium"
    }
  ]
}
```

### Success criteria
- same or better extraction quality than TS baseline
- noticeably faster scanning on large local folders
- no impact on main app iteration speed
