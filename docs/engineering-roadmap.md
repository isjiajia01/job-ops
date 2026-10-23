# Engineering Roadmap

This folder turns the current architecture/testing/runtime discussion into project-local execution artifacts.

## Documents
- `ghostwriter-implementation-plan.md`
  - Priority 1: structural cleanup, module boundaries, shared type convergence, runtime explainability.
- `ghostwriter-test-plan.md`
  - Priority 2: pipeline tests, contract tests, payload normalization tests, timeline schema tests.
- `rust-extraction-evaluation.md`
  - Priority 3: selective Rust readiness and candidate-module evaluation.

## Recommended execution order
1. Finish Priority 1 until Ghostwriter is structurally stable.
2. Push Priority 2 until refactors are test-safe.
3. Only then select one low-risk Rust pilot from Priority 3.

## Practical completion targets
- Priority 1 is “90% done” when Ghostwriter architecture is mostly modular and runtime explanations are server-authored.
- Priority 2 is “90% done” when core pipeline/contract/schema risks are locked down by tests.
- Priority 3 is “90% done” when one Rust pilot is clearly chosen, bounded, and optional — not when the app is rewritten.
