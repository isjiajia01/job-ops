# JobOps

[![Stars](https://img.shields.io/github/stars/isjiajia01/job-ops?style=social)](https://github.com/isjiajia01/job-ops)

<img width="1200" height="600" alt="Jobops-banner-900" src="https://github.com/user-attachments/assets/e929e389-2ebb-4de1-82c6-8e136b849b78" />

JobOps is a self-hosted job-search operations platform: it discovers roles from multiple job boards, scores fit against a candidate profile with an LLM, generates tailored resume content, exports PDFs through RxResume, and tracks post-application email replies.

This repository is a public customized fork of the upstream `DaKheera47/job-ops` project, with additional work around resume-tailoring depth, Denmark-oriented search flow, and local evaluation utilities for improving AI-written CV output.

In practical terms, the system helps with:

- multi-source job discovery
- fit scoring with configurable LLM backends
- structured resume tailoring for headline, summary, skills, experience bullets, and section emphasis
- RxResume-backed PDF generation
- Gmail-based post-application tracking
- self-hosted deployment with Docker and SQLite

## 40s Demo: Crawl → Score → PDF → Track

<details>
<summary>
Pipeline Demo
</summary>
  
  https://github.com/user-attachments/assets/5b9157a9-13b0-4ec6-9bd2-a39dbc2b11c5
</details>


<details>
<summary>
Apply & Track
</summary>
  
  https://github.com/user-attachments/assets/06e5e782-47f5-42d0-8b28-b89102d7ea1b
</details>

## Documentation (Start Here)

JobOps ships with full docs for setup, architecture, extractors, and troubleshooting.

If you want the serious view of the project, start here:

- [Documentation Home](https://jobops.dakheera47.com/docs/)
- [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting)
- [Feature Overview](https://jobops.dakheera47.com/docs/features/overview)
- [Orchestrator Pipeline](https://jobops.dakheera47.com/docs/features/orchestrator)
- [Extractor System](https://jobops.dakheera47.com/docs/extractors/overview)
- [Troubleshooting](https://jobops.dakheera47.com/docs/troubleshooting/common-problems)

## Quick Start (10 Min)

Prefer guided setup? Follow the [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting).

```bash
# 1. Download
git clone https://github.com/isjiajia01/job-ops.git
cd job-ops

# 2. Start (Pulls pre-built image)
docker compose up -d

# 3. Launch Dashboard
# Open http://localhost:3005 to start the onboarding wizard

```

## Why JobOps?

* **Universal Scraping**: Supports **LinkedIn, Indeed, Glassdoor, Adzuna, Hiring Café, Gradcracker, UK Visa Jobs**.
* **AI Scoring**: Ranks jobs by fit against *your* profile using your preferred LLM (OpenAI, OpenRouter, `openai-compatible` endpoints such as LM Studio/Ollama, Gemini).
* **Auto-Tailoring**: Generates custom resumes (PDFs) for every application using RxResume v4.
* **Email Tracking**: Connect Gmail to auto-detect interviews, offers, and rejections.
* **Self-Hosted**: Your data stays with you. SQLite database. No SaaS fees.

## Workflow

1. **Search**: Scrapes job boards for roles matching your criteria.
2. **Score**: AI ranks jobs (0-100) based on your resume/profile.
3. **Tailor**: Generates a custom resume summary & keyword optimization for top matches.
4. **Export**: Uses [RxResume v4](https://v4.rxresu.me) to create tailored PDFs.
5. **Track**: "Smart Router" AI watches your inbox for recruiter replies.

## Supported Extractors

| Platform | Focus |
| --- | --- |
| **LinkedIn** | Global / General |
| **Indeed** | Global / General |
| **Glassdoor** | Global / General |
| **Adzuna** | Multi-country API source |
| **Hiring Café** | Global / General |
| **Gradcracker** | STEM / Grads (UK) |
| **UK Visa Jobs** | Sponsorship (UK) |

*(More extractors can be added via TypeScript - see [extractors documentation](https://jobops.dakheera47.com/docs/extractors/overview))*

## Post-App Tracking (Killer Feature)

Connect Gmail → AI routes emails to your applied jobs.

* "We'd like to interview you..." → **Status: Interviewing** (Auto-updated)
* "Unfortunately..." → **Status: Rejected** (Auto-updated)

See [post-application tracking docs](https://jobops.dakheera47.com/docs/features/post-application-tracking) for setup.

**Note on Analytics**: The alpha version includes anonymous analytics (Umami) to help debug performance. To opt-out, block `umami.dakheera47.com` in your firewall/DNS.

## ☁️ Cloud Version (Coming Soon)

Self-hosting not your thing? A hosted version of JobOps is coming.

- No Docker required
- Up and running in 2 minutes
- Managed updates
- Self-hosted will always be free and open source

👉 Join the waitlist at [https://try.jobops.app](https://try.jobops.app?utm_source=github&utm_medium=readme&utm_campaign=waitlist)
<br>
Support me on [kofi](https://ko-fi.com/shaheersarfaraz)

## Contributing

Want to contribute code, docs, or extractors? Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).


## Star History

<a href="https://www.star-history.com/#DaKheera47/job-ops&type=date&legend=top-left">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&theme=dark&legend=top-left" />
<source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
<img alt="Star History Chart" src="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
</picture>
</a>

## License

**AGPLv3 + Commons Clause** - You can self-host, use, and modify JobOps, but
you cannot sell the software itself or offer paid hosted/support services whose
value substantially comes from JobOps. See [LICENSE](LICENSE).
