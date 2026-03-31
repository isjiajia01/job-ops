import type { Job, ResumeProfile } from "@shared/types.js";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import type React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { parseTailoredSkills } from "@/client/components/tailoring-utils";
import { Button } from "@/components/ui/button";
import * as api from "../api";
import { useProfile } from "../hooks/useProfile";

function resolveHeadline(
  job: Job | null,
  profile: ResumeProfile | null,
): string {
  return (
    job?.tailoredHeadline ||
    profile?.basics?.headline ||
    profile?.basics?.label ||
    "CV Draft"
  );
}

function resolveSummary(
  job: Job | null,
  profile: ResumeProfile | null,
): string {
  return (
    job?.tailoredSummary ||
    profile?.sections?.summary?.content ||
    profile?.basics?.summary ||
    ""
  );
}

function resolveSkills(
  job: Job | null,
  profile: ResumeProfile | null,
): string[] {
  const tailored = parseTailoredSkills(job?.tailoredSkills);
  if (tailored.length > 0) {
    return tailored
      .flatMap((group) =>
        group.keywords.length > 0 ? group.keywords : [group.name],
      )
      .filter(Boolean);
  }

  return (profile?.sections?.skills?.items ?? [])
    .flatMap((item) => (item.keywords?.length ? item.keywords : [item.name]))
    .filter(Boolean);
}

export const CvPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();

  const jobQuery = useQuery<Job | null>({
    queryKey: ["applications", "detail", id ?? null] as const,
    queryFn: () => (id ? api.getApplication(id) : Promise.resolve(null)),
    enabled: Boolean(id),
  });

  const job = jobQuery.data ?? null;
  const personName = profile?.basics?.name || "Candidate";
  const headline = resolveHeadline(job, profile);
  const summary = resolveSummary(job, profile);
  const skills = resolveSkills(job, profile);
  const experience = profile?.sections?.experience?.items ?? [];
  const projects = profile?.sections?.projects?.items ?? [];
  const location = [
    profile?.basics?.location?.city,
    profile?.basics?.location?.region,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-6">
      <div className="mx-auto mb-4 flex max-w-5xl items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <article className="mx-auto grid max-w-5xl gap-8 rounded-2xl border border-stone-200 bg-white px-8 py-10 shadow-sm lg:grid-cols-[0.7fr_1.3fr]">
        <aside className="space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              CV Preview
            </div>
            <h1 className="font-serif text-4xl leading-tight text-stone-900">
              {personName}
            </h1>
            <p className="text-sm leading-6 text-stone-600">{headline}</p>
          </div>

          <div className="space-y-1 text-sm leading-6 text-stone-700">
            {profile?.basics?.email ? <div>{profile.basics.email}</div> : null}
            {profile?.basics?.phone ? <div>{profile.basics.phone}</div> : null}
            {location ? <div>{location}</div> : null}
            {profile?.basics?.url ? <div>{profile.basics.url}</div> : null}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 text-sm leading-6 text-stone-700">
            <div className="font-medium text-stone-900">
              {job?.employer || "Target role"}
            </div>
            <div>{job?.title || "General CV view"}</div>
            {job?.location ? <div>{job.location}</div> : null}
          </div>

          {skills.length > 0 ? (
            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Skills
              </div>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <section className="space-y-8">
          {summary ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                <FileText className="h-3.5 w-3.5" />
                Summary
              </div>
              <p className="whitespace-pre-wrap text-[15px] leading-8 text-stone-800">
                {summary}
              </p>
            </section>
          ) : null}

          {experience.length > 0 ? (
            <section className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Experience
              </div>
              {experience.map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-medium text-stone-900">
                      {item.position} @ {item.company}
                    </div>
                    {item.date ? (
                      <div className="text-xs text-stone-500">{item.date}</div>
                    ) : null}
                  </div>
                  {item.location ? (
                    <div className="text-sm text-stone-500">
                      {item.location}
                    </div>
                  ) : null}
                  {item.summary ? (
                    <div className="whitespace-pre-wrap text-sm leading-7 text-stone-700">
                      {item.summary}
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {projects.length > 0 ? (
            <section className="space-y-4">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Projects
              </div>
              {projects.map((item) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-medium text-stone-900">
                      {item.name}
                    </div>
                    {item.date ? (
                      <div className="text-xs text-stone-500">{item.date}</div>
                    ) : null}
                  </div>
                  {item.summary ? (
                    <div className="whitespace-pre-wrap text-sm leading-7 text-stone-700">
                      {item.summary}
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
        </section>
      </article>
    </main>
  );
};
