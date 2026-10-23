# JobOps — Private AI Job-Search Operations Pilot

JobOps is my private, invite-only AI job-search operations tool for structuring job discovery, fit triage, tailored-material workflows, application tracking, and rejection-feedback learning.

This repository is **not positioned as a commercial SaaS**. My current use case is a local-first pilot: I run it for my own job-search workflow and help a small peer group deploy/use it locally when useful. The product goal is trust and workflow quality, not growth-at-all-costs.

## What this project demonstrates

- Adapting a substantial open-source codebase into a practical workflow product instead of building a toy greenfield demo.
- Operating a Docker/SQLite/LLM-assisted application with deployment, configuration, backups, and docs.
- Designing human-reviewed AI workflows where fit assessment, CV/cover-letter drafting, and post-application tracking are auditable rather than automatic.
- Handling sensitive career data with explicit privacy boundaries, local-first deployment, and anonymized feedback notes.
- Turning real usage signals from a small peer pilot into product decisions: profile setup, application statuses, role-fit labels, do-not-claim guardrails, and rejection-feedback loops.

## Positioning boundary

JobOps should be understood as:

- **Private pilot / portfolio-grade operations tool**
- **Self-hosted and local-first by default**
- **Human-in-the-loop**: users review every generated claim and submit applications themselves
- **Privacy-aware**: peer usage can be tracked as anonymized feedback without importing personal CV data into a shared database

JobOps should **not** be described as:

- a commercial SaaS
- an autonomous job-application bot
- an enterprise hiring platform
- proof of large-scale commercial AI product ownership

## Current pilot layer

The local fork adds a Private Pilot workspace:

- pilot user registry for friends/local deployments
- lightweight profile metadata and completeness tracking
- target-role and do-not-claim guardrail fields
- anonymized feedback notes
- explicit non-commercial/privacy boundary copy

See [`docs/private-pilot-plan.md`](./docs/private-pilot-plan.md) for the implementation roadmap and the interview/CV story this project is meant to support.

## Core workflow

1. **Capture roles** from job boards or pasted job descriptions.
2. **Score and triage fit** against a candidate profile.
3. **Tailor materials** with human-reviewed evidence selection and claim boundaries.
4. **Track applications** through applied, interview, rejection, offer, or follow-up states.
5. **Learn from outcomes** by recording rejection reasons, recruiter feedback, and targeting lessons.

## Technical stack

- TypeScript monorepo
- React + Vite frontend
- Express backend
- Drizzle ORM + SQLite
- Docker-based self-hosting
- LLM provider configuration for scoring/tailoring workflows
- Docusaurus docs site

## Quick start

```bash
# From repository root
npm install
npm --workspace workspace run db:migrate
npm --workspace workspace run dev
```

For Docker-based local deployment, use the existing compose setup and configure credentials in `.env`.

```bash
cp .env.example .env
# edit BASIC_AUTH_USER / BASIC_AUTH_PASSWORD and LLM settings
docker compose up -d
```

Then open the local dashboard and complete onboarding.

## Privacy defaults for peer use

When helping friends use JobOps, prefer:

- local deployment on their machine or a dedicated private instance
- no shared import of their full CV/application data into my own database
- anonymized feedback notes only
- explicit consent before storing contact details or profile metadata
- human review before generated text is copied into real applications

## Upstream basis and license

This fork is based on the open-source JobOps project by DaKheera47. The original project remains licensed under **AGPLv3 + Commons Clause**. This local fork preserves that licensing context and is used as a private/portfolio adaptation rather than a paid hosted product.
