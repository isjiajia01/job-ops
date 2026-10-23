# Private Pilot Portfolio Evidence

## CV bullets

### Software / internal tools version

- Adapted and extended a TypeScript/React/Express/SQLite job-search operations platform into a private, local-first pilot for peer users, adding pilot user/profile metadata, fit-triage decision logs, claim-boundary checks, and anonymized feedback loops.
- Built a human-in-the-loop AI workflow layer for job applications, linking role-fit decisions and claim checks into the application workspace so AI-generated CV/cover-letter drafts remain reviewable and factually defensible.

### Product / operations version

- Operated JobOps as a small invite-only career-operations pilot rather than a commercial SaaS, using peer feedback to improve onboarding, role targeting, application tracking, privacy boundaries, and rejection-feedback learning.
- Designed privacy-aware pilot workflows that support local deployments for friends while avoiding unnecessary central storage of sensitive CV/application data.

### Applied AI / trustworthy workflow version

- Implemented guardrails for AI-assisted application materials, including do-not-claim profile constraints, fit labels for application prioritization, and persisted claim checks before generated wording is used.

## Interview story

JobOps began as a self-hosted tool for organizing job search, but I noticed peers had the same operational problem: job links, fit decisions, tailored materials, and outcomes were scattered. I did not want to turn it into a commercial product because the domain involves sensitive personal data and factual claims. Instead, I treated it as a private pilot.

The most important product decision was to make the AI workflow reviewable. The system now records role-fit decisions before tailoring, stores do-not-claim guardrails in lightweight profile metadata, checks generated text for claim-boundary risks, and records anonymized feedback/rejection signals. This makes the project less like a generic CV generator and more like a career-operations control plane.

## Screenshot checklist

Capture these screens after running `npm run pilot:seed-demo` and starting the app:

1. `/pilot` top boundary + metrics cards.
2. `/pilot` pilot user/profile card showing local-only privacy and do-not-claim guardrails.
3. `/pilot` fit-triage decision log with two contrasting roles.
4. `/pilot` claim-boundary checker with pass/blocker examples.
5. `/applications/<demo-id>` guardrails card showing reviews/checks inside the application workspace.
6. README / docs positioning if a static evidence image is useful.

## Demo seed command

```bash
npm run pilot:seed-demo
```

This creates:

- one demo pilot user;
- profile metadata and guardrails;
- two demo applications;
- two fit reviews;
- two claim checks;
- feedback and rejection-signal notes.
