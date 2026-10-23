# JobOps Private Pilot Completion Plan

## Positioning

JobOps should be presented as a private, invite-only AI job-search operations pilot, not a commercial SaaS. The credible story is: a self-hosted tool adapted for Jiajia and a small peer group, focused on trustworthy workflow quality, factuality guardrails, application tracking, and rejection-feedback learning.

## Load-bearing assumptions

- Friends currently use locally deployed instances, not one shared hosted multi-tenant instance.
- We do not need to ingest friends' real personal data into Jiajia's production database.
- The project should look third-party usable through a realistic user/profile database and pilot workflow, while keeping privacy and non-commercial boundaries explicit.
- Existing JobOps is currently single-user; a full multi-tenant refactor would be larger than this local polish pass.

## Implementation phases

### Phase 1 — local pilot foundation (current pass)

Goal: make the app visibly private-pilot ready without risky multi-tenant rewrites.

- Reposition README and app copy from cloud-waitlist/public SaaS to private pilot / portfolio-grade tool.
- Add first-class pilot user/profile database tables for local deployments:
  - `pilot_users`
  - `pilot_user_profiles`
  - `pilot_feedback_notes`
- Add API routes under `/api/pilot/*` for:
  - pilot overview
  - create/update/list users
  - create/update profile
  - record anonymized feedback notes
- Add a client Pilot page with:
  - pilot status cards
  - user/profile list
  - profile completeness and privacy stance
  - anonymized feedback notes
  - non-commercial/product boundary copy
- Keep the existing single-user job/profile flow as the operational default; pilot users are a portfolio/pilot registry, not full data isolation yet.

### Phase 2 — user-facing polish

Implemented in the current local pass:

- Added a Private Pilot page that distinguishes local peer deployments from a shared commercial product.
- Added pilot profile checklist fields:
  - target roles
  - core skills
  - hard constraints
  - do-not-claim guardrails
  - project/evidence summary
  - profile completeness
- Added privacy mode and local-only/anonymized-note positioning.

Remaining:

- Add import/export/delete guidance for local deployments.
- Add seeded demo pilot users and screenshot-ready sample data.
- Add onboarding copy that distinguishes owner setup, invited local user setup, and demo-safe profile setup.

### Phase 3 — trustworthy workflow layer

Implemented in the current local pass:

- Added a role-fit triage record view:
  - Strong / worth applying
  - Moderate-stretch / worth applying
  - Low-probability stretch / usually skip
  - Not suitable / do not apply
- Added a lightweight claim-boundary checker before using generated CV/cover-letter text.
- Added application-review and claim-check counts to the pilot overview.

Remaining:

- Connect fit reviews directly to real application records.
- Expand claim-boundary checks for unsupported tools, invented metrics, language/work-authorization claims, and portfolio-demo-vs-commercial-production overclaiming.
- Add richer rejection-feedback fields:
  - rejection reason
  - pattern tags
  - future targeting advice
  - skill/evidence gap

### Phase 4 — public portfolio package

- Add demo-safe seed data and screenshots.
- Add a 3-minute demo script.
- Add architecture/privacy docs.
- Add CV bullets and interview talking points.

## Recommended CV story after Phase 1+

> Adapted and operated a private invite-only AI job-search operations tool used by a small peer group, adding profile management, application tracking, fit-triage workflows, anonymized feedback notes, and privacy-aware guardrails for human-reviewed CV/cover-letter workflows.

## Not claiming

- Not commercial SaaS.
- Not enterprise production AI hiring platform.
- Not autonomous application submission.
- Not shared-hosted storage of friends' sensitive data unless explicitly implemented and consented.
