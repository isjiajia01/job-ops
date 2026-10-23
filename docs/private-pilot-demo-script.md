# JobOps Private Pilot Demo Script

## 3-minute walkthrough

### 0:00–0:30 — Positioning

"JobOps is not a commercial SaaS. I use it as a private, invite-only AI career-operations pilot. I run it for my own applications and help a small peer group deploy it locally. The product goal is workflow quality and trust: role-fit triage, human-reviewed materials, claim boundaries, application tracking, and feedback loops."

Show:

- README positioning
- `/pilot` page boundary card
- metrics cards

### 0:30–1:10 — Pilot users and privacy

"Instead of importing friends' real CV data into my own system, the pilot registry tracks local deployments and lightweight profile metadata. Users can define target roles, hard constraints, and do-not-claim guardrails. This keeps the system third-party usable while respecting privacy."

Show:

- pilot user card
- profile completeness
- privacy mode: `local_only`
- do-not-claim guardrails

### 1:10–1:50 — Fit triage before tailoring

"Before generating materials, the workflow records whether a role is strong, a defensible stretch, usually a skip, or not suitable. This prevents wasting time on roles with hard blockers like Danish-only requirements, seniority mismatch, or unsupported core stack."

Show:

- fit-triage form
- saved reviews
- Application Workspace guardrails card with saved fit reviews

### 1:50–2:30 — Claim-boundary checker

"The system treats AI output as a draft, not truth. Before text is copied into a CV or cover letter, a claim-boundary checker flags wording that conflicts with the user's guardrails, such as fluent Danish, commercial AI product ownership, or enterprise-scale production claims."

Show:

- claim checker form
- pass/warning/blocker records
- Application Workspace claim-check history

### 2:30–3:00 — Feedback loop and product judgment

"The pilot records anonymized feedback and rejection signals. For example, if a rejected AI Engineer application indicates that shortlisted candidates had current commercial AI Engineer experience, the targeting logic can treat similar pure AI Engineer roles as stretch next time."

Show:

- anonymized feedback notes
- rejection signal note
- final docs: `docs/private-pilot-plan.md`

## One-sentence interview summary

"I adapted JobOps into a private, local-first AI career-operations pilot used with a small peer group, adding profile metadata, fit-triage decisions, claim-boundary checks, anonymized feedback notes, and application-workspace guardrails so AI-assisted job applications stay useful, private, and factually defensible."
