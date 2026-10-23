/**
 * Database schema using Drizzle ORM with SQLite.
 */

import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  APPLICATION_TASK_TYPES,
  INTERVIEW_OUTCOMES,
  INTERVIEW_TYPES,
  JOB_CHAT_MESSAGE_ROLES,
  JOB_CHAT_MESSAGE_STATUSES,
  JOB_CHAT_RUN_STATUSES,
  POST_APPLICATION_INTEGRATION_STATUSES,
  POST_APPLICATION_MESSAGE_TYPES,
  POST_APPLICATION_PROCESSING_STATUSES,
  POST_APPLICATION_PROVIDERS,
  POST_APPLICATION_RELEVANCE_DECISIONS,
  POST_APPLICATION_SYNC_RUN_STATUSES,
} from "@shared/types";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),

    // From crawler
    source: text("source").notNull().default("gradcracker"),
    sourceJobId: text("source_job_id"),
    jobUrlDirect: text("job_url_direct"),
    datePosted: text("date_posted"),
    title: text("title").notNull(),
    employer: text("employer").notNull(),
    employerUrl: text("employer_url"),
    jobUrl: text("job_url").notNull().unique(),
    applicationLink: text("application_link"),
    disciplines: text("disciplines"),
    deadline: text("deadline"),
    salary: text("salary"),
    location: text("location"),
    degreeRequired: text("degree_required"),
    starting: text("starting"),
    jobDescription: text("job_description"),

    // JobSpy fields (nullable for other sources)
    jobType: text("job_type"),
    salarySource: text("salary_source"),
    salaryInterval: text("salary_interval"),
    salaryMinAmount: real("salary_min_amount"),
    salaryMaxAmount: real("salary_max_amount"),
    salaryCurrency: text("salary_currency"),
    isRemote: integer("is_remote", { mode: "boolean" }),
    jobLevel: text("job_level"),
    jobFunction: text("job_function"),
    listingType: text("listing_type"),
    emails: text("emails"),
    companyIndustry: text("company_industry"),
    companyLogo: text("company_logo"),
    companyUrlDirect: text("company_url_direct"),
    companyAddresses: text("company_addresses"),
    companyNumEmployees: text("company_num_employees"),
    companyRevenue: text("company_revenue"),
    companyDescription: text("company_description"),
    skills: text("skills"),
    experienceRange: text("experience_range"),
    companyRating: real("company_rating"),
    companyReviewsCount: integer("company_reviews_count"),
    vacancyCount: integer("vacancy_count"),
    workFromHomeType: text("work_from_home_type"),

    // Application workspace enrichments
    status: text("status", {
      enum: [
        "discovered",
        "processing",
        "ready",
        "applied",
        "in_progress",
        "skipped",
        "expired",
      ],
    })
      .notNull()
      .default("discovered"),
    outcome: text("outcome", { enum: APPLICATION_OUTCOMES }),
    closedAt: integer("closed_at", { mode: "number" }),
    suitabilityScore: real("suitability_score"),
    suitabilityReason: text("suitability_reason"),
    tailoredSummary: text("tailored_summary"),
    tailoredHeadline: text("tailored_headline"),
    tailoredSkills: text("tailored_skills"),
    tailoredExperienceEdits: text("tailored_experience_edits"),
    tailoredLayoutDirectives: text("tailored_layout_directives"),
    tailoredSectionRationale: text("tailored_section_rationale"),
    tailoredOmissionRationale: text("tailored_omission_rationale"),
    selectedProjectIds: text("selected_project_ids"),
    pdfPath: text("pdf_path"),
    tracerLinksEnabled: integer("tracer_links_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    sponsorMatchScore: real("sponsor_match_score"),
    sponsorMatchNames: text("sponsor_match_names"),

    // Timestamps
    discoveredAt: text("discovered_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    processedAt: text("processed_at"),
    appliedAt: text("applied_at"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    statusDiscoveredAtIndex: index("idx_jobs_status_discovered_at").on(
      table.status,
      table.discoveredAt,
    ),
    statusUpdatedAtIndex: index("idx_jobs_status_updated_at").on(
      table.status,
      table.updatedAt,
    ),
    statusAppliedAtIndex: index("idx_jobs_status_applied_at").on(
      table.status,
      table.appliedAt,
    ),
    sourceSourceJobIdIndex: index("idx_jobs_source_source_job_id").on(
      table.source,
      table.sourceJobId,
    ),
  }),
);

export const stageEvents = sqliteTable("stage_events", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  groupId: text("group_id"),
  fromStage: text("from_stage", { enum: APPLICATION_STAGES }),
  toStage: text("to_stage", { enum: APPLICATION_STAGES }).notNull(),
  occurredAt: integer("occurred_at", { mode: "number" }).notNull(),
  metadata: text("metadata", { mode: "json" }),
  outcome: text("outcome", { enum: APPLICATION_OUTCOMES }),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  type: text("type", { enum: APPLICATION_TASK_TYPES }).notNull(),
  title: text("title").notNull(),
  dueDate: integer("due_date", { mode: "number" }),
  isCompleted: integer("is_completed", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
});

export const interviews = sqliteTable("interviews", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  scheduledAt: integer("scheduled_at", { mode: "number" }).notNull(),
  durationMins: integer("duration_mins"),
  type: text("type", { enum: INTERVIEW_TYPES }).notNull(),
  outcome: text("outcome", { enum: INTERVIEW_OUTCOMES }),
});

export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull().default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
  status: text("status", {
    enum: ["running", "completed", "failed", "cancelled"],
  })
    .notNull()
    .default("running"),
  jobsDiscovered: integer("jobs_discovered").notNull().default(0),
  jobsProcessed: integer("jobs_processed").notNull().default(0),
  errorMessage: text("error_message"),
});

export const jobChatThreads = sqliteTable(
  "job_chat_threads",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
    lastMessageAt: text("last_message_at"),
    activeRootMessageId: text("active_root_message_id"),
  },
  (table) => ({
    jobUpdatedIndex: index("idx_job_chat_threads_job_updated").on(
      table.jobId,
      table.updatedAt,
    ),
  }),
);

export const jobChatMessages = sqliteTable(
  "job_chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => jobChatThreads.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    role: text("role", { enum: JOB_CHAT_MESSAGE_ROLES }).notNull(),
    content: text("content").notNull().default(""),
    status: text("status", { enum: JOB_CHAT_MESSAGE_STATUSES })
      .notNull()
      .default("partial"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    version: integer("version").notNull().default(1),
    replacesMessageId: text("replaces_message_id"),
    parentMessageId: text("parent_message_id"),
    activeChildId: text("active_child_id"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    threadCreatedIndex: index("idx_job_chat_messages_thread_created").on(
      table.threadId,
      table.createdAt,
    ),
  }),
);

export const jobChatRuns = sqliteTable(
  "job_chat_runs",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => jobChatThreads.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status", { enum: JOB_CHAT_RUN_STATUSES })
      .notNull()
      .default("running"),
    model: text("model"),
    provider: text("provider"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
    requestId: text("request_id"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    threadStatusIndex: index("idx_job_chat_runs_thread_status").on(
      table.threadId,
      table.status,
    ),
  }),
);

export const jobChatRunEvents = sqliteTable(
  "job_chat_run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => jobChatRuns.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => jobChatThreads.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    phase: text("phase").notNull(),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    payload: text("payload", { mode: "json" }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => ({
    runSequenceIndex: uniqueIndex("idx_job_chat_run_events_run_sequence").on(
      table.runId,
      table.sequence,
    ),
    runCreatedAtIndex: index("idx_job_chat_run_events_run_created_at").on(
      table.runId,
      table.createdAt,
    ),
    jobCreatedAtIndex: index("idx_job_chat_run_events_job_created_at").on(
      table.jobId,
      table.createdAt,
    ),
  }),
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const postApplicationIntegrations = sqliteTable(
  "post_application_integrations",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    displayName: text("display_name"),
    status: text("status", { enum: POST_APPLICATION_INTEGRATION_STATUSES })
      .notNull()
      .default("disconnected"),
    credentials: text("credentials", { mode: "json" }),
    lastConnectedAt: integer("last_connected_at", { mode: "number" }),
    lastSyncedAt: integer("last_synced_at", { mode: "number" }),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountUnique: uniqueIndex(
      "idx_post_app_integrations_provider_account_unique",
    ).on(table.provider, table.accountKey),
  }),
);

export const postApplicationSyncRuns = sqliteTable(
  "post_application_sync_runs",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    integrationId: text("integration_id").references(
      () => postApplicationIntegrations.id,
      { onDelete: "set null" },
    ),
    status: text("status", { enum: POST_APPLICATION_SYNC_RUN_STATUSES })
      .notNull()
      .default("running"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
    messagesDiscovered: integer("messages_discovered").notNull().default(0),
    messagesRelevant: integer("messages_relevant").notNull().default(0),
    messagesClassified: integer("messages_classified").notNull().default(0),
    messagesMatched: integer("messages_matched").notNull().default(0),
    messagesApproved: integer("messages_approved").notNull().default(0),
    messagesDenied: integer("messages_denied").notNull().default(0),
    messagesErrored: integer("messages_errored").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountStartedAtIndex: index(
      "idx_post_app_sync_runs_provider_account_started_at",
    ).on(table.provider, table.accountKey, table.startedAt),
  }),
);

export const postApplicationMessages = sqliteTable(
  "post_application_messages",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: POST_APPLICATION_PROVIDERS }).notNull(),
    accountKey: text("account_key").notNull().default("default"),
    integrationId: text("integration_id").references(
      () => postApplicationIntegrations.id,
      { onDelete: "set null" },
    ),
    syncRunId: text("sync_run_id").references(
      () => postApplicationSyncRuns.id,
      {
        onDelete: "set null",
      },
    ),
    externalMessageId: text("external_message_id").notNull(),
    externalThreadId: text("external_thread_id"),
    fromAddress: text("from_address").notNull().default(""),
    fromDomain: text("from_domain"),
    senderName: text("sender_name"),
    subject: text("subject").notNull().default(""),
    receivedAt: integer("received_at", { mode: "number" }).notNull(),
    snippet: text("snippet").notNull().default(""),
    classificationLabel: text("classification_label"),
    classificationConfidence: real("classification_confidence"),
    classificationPayload: text("classification_payload", { mode: "json" }),
    relevanceLlmScore: real("relevance_llm_score"),
    relevanceDecision: text("relevance_decision", {
      enum: POST_APPLICATION_RELEVANCE_DECISIONS,
    })
      .notNull()
      .default("needs_llm"),
    matchConfidence: integer("match_confidence"),
    messageType: text("message_type", {
      enum: POST_APPLICATION_MESSAGE_TYPES,
    })
      .notNull()
      .default("other"),
    stageEventPayload: text("stage_event_payload", { mode: "json" }),
    processingStatus: text("processing_status", {
      enum: POST_APPLICATION_PROCESSING_STATUSES,
    })
      .notNull()
      .default("pending_user"),
    matchedJobId: text("matched_job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    decidedAt: integer("decided_at", { mode: "number" }),
    decidedBy: text("decided_by"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    providerAccountExternalMessageUnique: uniqueIndex(
      "idx_post_app_messages_provider_account_external_unique",
    ).on(table.provider, table.accountKey, table.externalMessageId),
    providerAccountReviewStatusIndex: index(
      "idx_post_app_messages_provider_account_processing_status",
    ).on(table.provider, table.accountKey, table.processingStatus),
  }),
);

export const tracerLinks = sqliteTable(
  "tracer_links",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    sourceLabel: text("source_label").notNull(),
    destinationUrl: text("destination_url").notNull(),
    destinationUrlHash: text("destination_url_hash").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    jobPathDestinationUnique: uniqueIndex(
      "idx_tracer_links_job_source_destination_unique",
    ).on(table.jobId, table.sourcePath, table.destinationUrlHash),
    jobIndex: index("idx_tracer_links_job_id").on(table.jobId),
  }),
);

export const pilotUsers = sqliteTable(
  "pilot_users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    status: text("status", {
      enum: ["invited", "active", "paused", "archived"],
    })
      .notNull()
      .default("invited"),
    usageMode: text("usage_mode", {
      enum: ["local_deploy", "guided_session", "demo_only"],
    })
      .notNull()
      .default("local_deploy"),
    privacyMode: text("privacy_mode", {
      enum: ["local_only", "anonymized_notes", "shared_with_consent"],
    })
      .notNull()
      .default("local_only"),
    targetRoles: text("target_roles", { mode: "json" }),
    notes: text("notes"),
    invitedAt: integer("invited_at", { mode: "number" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    lastActiveAt: integer("last_active_at", { mode: "number" }),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    statusIndex: index("idx_pilot_users_status").on(table.status),
    usageModeIndex: index("idx_pilot_users_usage_mode").on(table.usageMode),
  }),
);

export const pilotUserProfiles = sqliteTable(
  "pilot_user_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => pilotUsers.id, { onDelete: "cascade" }),
    headline: text("headline"),
    location: text("location"),
    targetRoles: text("target_roles", { mode: "json" }),
    coreSkills: text("core_skills", { mode: "json" }),
    hardConstraints: text("hard_constraints", { mode: "json" }),
    doNotClaim: text("do_not_claim", { mode: "json" }),
    evidenceSummary: text("evidence_summary"),
    profileCompleteness: integer("profile_completeness").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
    updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIndex: uniqueIndex("idx_pilot_user_profiles_user_id").on(table.userId),
  }),
);

export const pilotFeedbackNotes = sqliteTable(
  "pilot_feedback_notes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => pilotUsers.id, {
      onDelete: "set null",
    }),
    noteType: text("note_type", {
      enum: ["feedback", "observation", "rejection_signal", "product_decision"],
    })
      .notNull()
      .default("feedback"),
    summary: text("summary").notNull(),
    actionTaken: text("action_taken"),
    isAnonymized: integer("is_anonymized", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIndex: index("idx_pilot_feedback_notes_user_id").on(table.userId),
    typeIndex: index("idx_pilot_feedback_notes_type").on(table.noteType),
  }),
);

export const pilotApplicationReviews = sqliteTable(
  "pilot_application_reviews",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => pilotUsers.id, {
      onDelete: "set null",
    }),
    applicationId: text("application_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    company: text("company").notNull(),
    roleTitle: text("role_title").notNull(),
    fitLabel: text("fit_label", {
      enum: [
        "strong_worth_applying",
        "moderate_stretch_worth_applying",
        "low_probability_usually_skip",
        "not_suitable_do_not_apply",
      ],
    }).notNull(),
    rationale: text("rationale").notNull(),
    risks: text("risks", { mode: "json" }),
    recommendedAction: text("recommended_action"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIndex: index("idx_pilot_application_reviews_user_id").on(table.userId),
    applicationIndex: index("idx_pilot_application_reviews_application_id").on(
      table.applicationId,
    ),
    fitIndex: index("idx_pilot_application_reviews_fit_label").on(
      table.fitLabel,
    ),
  }),
);

export const pilotClaimChecks = sqliteTable(
  "pilot_claim_checks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => pilotUsers.id, {
      onDelete: "set null",
    }),
    applicationId: text("application_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    sourceLabel: text("source_label").notNull(),
    checkedText: text("checked_text").notNull(),
    severity: text("severity", { enum: ["pass", "warning", "blocker"] })
      .notNull()
      .default("pass"),
    summary: text("summary").notNull(),
    flaggedClaims: text("flagged_claims", { mode: "json" }),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    userIndex: index("idx_pilot_claim_checks_user_id").on(table.userId),
    applicationIndex: index("idx_pilot_claim_checks_application_id").on(
      table.applicationId,
    ),
    severityIndex: index("idx_pilot_claim_checks_severity").on(table.severity),
  }),
);

export const tracerClickEvents = sqliteTable(
  "tracer_click_events",
  {
    id: text("id").primaryKey(),
    tracerLinkId: text("tracer_link_id")
      .notNull()
      .references(() => tracerLinks.id, { onDelete: "cascade" }),
    clickedAt: integer("clicked_at", { mode: "number" }).notNull(),
    requestId: text("request_id"),
    isLikelyBot: integer("is_likely_bot", { mode: "boolean" })
      .notNull()
      .default(false),
    deviceType: text("device_type").notNull().default("unknown"),
    uaFamily: text("ua_family").notNull().default("unknown"),
    osFamily: text("os_family").notNull().default("unknown"),
    referrerHost: text("referrer_host"),
    ipHash: text("ip_hash"),
    uniqueFingerprintHash: text("unique_fingerprint_hash"),
  },
  (table) => ({
    tracerLinkIndex: index("idx_tracer_click_events_tracer_link_id").on(
      table.tracerLinkId,
    ),
    clickedAtIndex: index("idx_tracer_click_events_clicked_at").on(
      table.clickedAt,
    ),
    botIndex: index("idx_tracer_click_events_is_likely_bot").on(
      table.isLikelyBot,
    ),
    uniqueFingerprintIndex: index(
      "idx_tracer_click_events_unique_fingerprint_hash",
    ).on(table.uniqueFingerprintHash),
  }),
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
export type StageEventRow = typeof stageEvents.$inferSelect;
export type NewStageEventRow = typeof stageEvents.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type InterviewRow = typeof interviews.$inferSelect;
export type NewInterviewRow = typeof interviews.$inferInsert;
export type PipelineRunRow = typeof pipelineRuns.$inferSelect;
export type NewPipelineRunRow = typeof pipelineRuns.$inferInsert;
export type JobChatThreadRow = typeof jobChatThreads.$inferSelect;
export type NewJobChatThreadRow = typeof jobChatThreads.$inferInsert;
export type JobChatMessageRow = typeof jobChatMessages.$inferSelect;
export type NewJobChatMessageRow = typeof jobChatMessages.$inferInsert;
export type JobChatRunRow = typeof jobChatRuns.$inferSelect;
export type NewJobChatRunRow = typeof jobChatRuns.$inferInsert;
export type JobChatRunEventRow = typeof jobChatRunEvents.$inferSelect;
export type NewJobChatRunEventRow = typeof jobChatRunEvents.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;
export type PostApplicationIntegrationRow =
  typeof postApplicationIntegrations.$inferSelect;
export type NewPostApplicationIntegrationRow =
  typeof postApplicationIntegrations.$inferInsert;
export type PostApplicationSyncRunRow =
  typeof postApplicationSyncRuns.$inferSelect;
export type NewPostApplicationSyncRunRow =
  typeof postApplicationSyncRuns.$inferInsert;
export type PostApplicationMessageRow =
  typeof postApplicationMessages.$inferSelect;
export type NewPostApplicationMessageRow =
  typeof postApplicationMessages.$inferInsert;
export type PilotUserRow = typeof pilotUsers.$inferSelect;
export type NewPilotUserRow = typeof pilotUsers.$inferInsert;
export type PilotUserProfileRow = typeof pilotUserProfiles.$inferSelect;
export type NewPilotUserProfileRow = typeof pilotUserProfiles.$inferInsert;
export type PilotFeedbackNoteRow = typeof pilotFeedbackNotes.$inferSelect;
export type NewPilotFeedbackNoteRow = typeof pilotFeedbackNotes.$inferInsert;
export type PilotApplicationReviewRow =
  typeof pilotApplicationReviews.$inferSelect;
export type NewPilotApplicationReviewRow =
  typeof pilotApplicationReviews.$inferInsert;
export type PilotClaimCheckRow = typeof pilotClaimChecks.$inferSelect;
export type NewPilotClaimCheckRow = typeof pilotClaimChecks.$inferInsert;
export type TracerLinkRow = typeof tracerLinks.$inferSelect;
export type NewTracerLinkRow = typeof tracerLinks.$inferInsert;
export type TracerClickEventRow = typeof tracerClickEvents.$inferSelect;
export type NewTracerClickEventRow = typeof tracerClickEvents.$inferInsert;
