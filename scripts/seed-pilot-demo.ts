import * as jobsRepo from "../workspace/src/server/repositories/jobs";
import {
  createPilotApplicationReview,
  createPilotClaimCheck,
  createPilotFeedbackNote,
  createPilotUser,
  listPilotUsers,
  upsertPilotProfile,
} from "../workspace/src/server/repositories/pilot";

async function main() {
  const existingUsers = await listPilotUsers();
  const existing = existingUsers.find(
    (user) => user.displayName === "Demo Peer Candidate",
  );
  const user =
    existing ??
    (await createPilotUser({
      displayName: "Demo Peer Candidate",
      email: null,
      status: "active",
      usageMode: "local_deploy",
      privacyMode: "local_only",
      targetRoles: [
        "Applied AI workflow roles",
        "Junior full-stack engineer",
        "Operations analyst",
      ],
      notes:
        "Seeded demo pilot user. Represents a friend/local deployment without storing sensitive CV data.",
    }));

  await upsertPilotProfile(user.id, {
    headline:
      "Early-career builder focused on AI-assisted internal tools and operations workflows",
    location: "Denmark / EU",
    targetRoles: [
      "Applied AI workflow roles",
      "Junior full-stack engineer",
      "Operations analyst",
    ],
    coreSkills: ["TypeScript", "React", "Python", "SQL", "Excel"],
    hardConstraints: [
      "No Danish-only roles",
      "No senior-only platform ownership roles",
      "Prefer roles with English working language",
    ],
    doNotClaim: [
      "fluent Danish",
      "production AI ownership",
      "commercial AI product",
      "enterprise scale",
    ],
    evidenceSummary:
      "Portfolio-grade internal tooling, structured role-fit assessment, data cleaning, and human-reviewed AI drafting workflows.",
    profileCompleteness: 85,
  });

  const appliedAiJob = await jobsRepo.createJob({
    source: "manual",
    title: "Applied AI Engineer",
    employer: "Nordic TaxTech Demo",
    jobUrl: "manual://pilot-demo-applied-ai-engineer",
    applicationLink: "https://example.com/pilot-demo/applied-ai",
    location: "Copenhagen, Denmark",
    jobType: "Full-time",
    jobLevel: "Early-career / mid-level stretch",
    jobFunction: "AI workflow engineering",
    jobDescription:
      "Demo role for an applied AI engineer building trustworthy internal workflows, structured triage, human approval steps, and audit logs for finance operations.",
  });

  const platformJob = await jobsRepo.createJob({
    source: "manual",
    title: "Application Platform Engineer",
    employer: "Nordic TaxTech Demo",
    jobUrl: "manual://pilot-demo-application-platform-engineer",
    applicationLink: "https://example.com/pilot-demo/platform",
    location: "Copenhagen, Denmark",
    jobType: "Full-time",
    jobLevel: "Senior",
    jobFunction: "Backend platform",
    jobDescription:
      "Demo role requiring Java, Spring Boot, Kubernetes, RabbitMQ, MySQL performance, OAuth/OIDC, payments, identity, and production incident ownership.",
  });

  await createPilotApplicationReview({
    userId: user.id,
    applicationId: appliedAiJob.id,
    company: appliedAiJob.employer,
    roleTitle: appliedAiJob.title,
    fitLabel: "moderate_stretch_worth_applying",
    rationale:
      "Worth applying as a stretch: the candidate can show trustworthy AI workflow evidence, internal tooling, structured outputs, approval gates, and audit logs, but lacks current commercial AI Engineer title experience.",
    risks: ["commercial AI title gap", "production LLM monitoring gap"],
    recommendedAction:
      "Apply with a truthful OpsDesk/JobOps workflow angle and avoid claiming enterprise production AI ownership.",
  });

  await createPilotApplicationReview({
    userId: user.id,
    applicationId: platformJob.id,
    company: platformJob.employer,
    roleTitle: platformJob.title,
    fitLabel: "low_probability_usually_skip",
    rationale:
      "Usually skip: the role is senior backend/platform ownership centered on Java, Spring Boot, Kubernetes, RabbitMQ, MySQL tuning, identity, payments, and incident ownership. Current evidence is adjacent but not direct.",
    risks: [
      "senior platform scope",
      "Java/Spring Boot gap",
      "Kubernetes production gap",
    ],
    recommendedAction:
      "Do not create a full package unless a recruiter confirms early-career flexibility.",
  });

  await createPilotClaimCheck({
    userId: user.id,
    applicationId: appliedAiJob.id,
    sourceLabel: "Applied AI cover-letter draft",
    checkedText:
      "I have built portfolio-grade AI workflow demos with approval and audit steps, but I do not claim commercial AI product or production AI ownership.",
    doNotClaim: [
      "fluent Danish",
      "production AI ownership",
      "commercial AI product",
      "enterprise scale",
    ],
  });

  await createPilotClaimCheck({
    userId: user.id,
    applicationId: platformJob.id,
    sourceLabel: "Platform role CV draft",
    checkedText:
      "This draft incorrectly says fluent Danish and enterprise scale platform ownership, so it should be blocked before use.",
    doNotClaim: ["fluent Danish", "enterprise scale"],
  });

  await createPilotFeedbackNote({
    userId: user.id,
    noteType: "feedback",
    summary:
      "Peer users wanted a clearer decision before spending time tailoring CVs for roles that were senior or language-blocked.",
    actionTaken:
      "Added fit labels and a role-decision log before material generation.",
    isAnonymized: true,
  });

  await createPilotFeedbackNote({
    userId: user.id,
    noteType: "rejection_signal",
    summary:
      "Rejected applied-AI roles often favored candidates with current commercial AI Engineer experience and released AI products.",
    actionTaken:
      "Updated targeting logic to treat pure AI Engineer roles as stretch unless commercial AI experience is explicitly not required.",
    isAnonymized: true,
  });

  console.log("Seeded pilot demo data", {
    userId: user.id,
    applicationIds: [appliedAiJob.id, platformJob.id],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
