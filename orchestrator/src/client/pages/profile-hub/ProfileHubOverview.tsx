import type { ResumeProfile } from "@shared/types";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type BasicsState = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  locationCity: string;
  locationRegion: string;
  url: string;
};

type OverviewStatCardProps = {
  label: string;
  value: string;
  hint: string;
};

export const OverviewStatCard: React.FC<OverviewStatCardProps> = ({
  label,
  value,
  hint,
}) => (
  <Card className="border-border/60 shadow-none">
    <CardContent className="space-y-1 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground">{hint}</div>
    </CardContent>
  </Card>
);

type HeroProps = {
  basics: BasicsState;
  summary: string;
  onBasicsChange: (next: BasicsState) => void;
  onSummaryChange: (value: string) => void;
};

export const ProfileHubHero: React.FC<HeroProps> = ({
  basics,
  summary,
  onBasicsChange,
  onSummaryChange,
}) => {
  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/20 shadow-sm">
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Fast maintenance lane
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Keep your candidate story sharp.
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            This page is now optimized around the few things that most improve CVs and cover letters: your positioning, your strongest facts, and your proof-of-work projects. Everything else is still here, but folded away until you need it.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4 rounded-2xl border border-border/60 bg-background/80 p-4">
            <div>
              <div className="text-sm font-medium text-foreground">Core positioning</div>
              <div className="text-xs text-muted-foreground">
                The top-level story the AI should understand first.
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Full name"
                value={basics.name}
                onChange={(event) => onBasicsChange({ ...basics, name: event.target.value })}
              />
              <Input
                placeholder="Headline / positioning"
                value={basics.headline}
                onChange={(event) => onBasicsChange({ ...basics, headline: event.target.value })}
              />
              <Input
                placeholder="Email"
                value={basics.email}
                onChange={(event) => onBasicsChange({ ...basics, email: event.target.value })}
              />
              <Input
                placeholder="Location"
                value={[basics.locationCity, basics.locationRegion].filter(Boolean).join(", ")}
                onChange={(event) => {
                  const [city = "", ...rest] = event.target.value.split(",");
                  onBasicsChange({
                    ...basics,
                    locationCity: city.trim(),
                    locationRegion: rest.join(",").trim(),
                  });
                }}
              />
              <Input
                className="sm:col-span-2"
                placeholder="Portfolio / LinkedIn URL"
                value={basics.url}
                onChange={(event) => onBasicsChange({ ...basics, url: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
            <div>
              <div className="text-sm font-medium text-foreground">What the writer will reach for</div>
              <div className="text-xs text-muted-foreground">
                Keep this compact, specific, and reusable across jobs.
              </div>
            </div>
            <Textarea
              value={summary}
              onChange={(event) => onSummaryChange(event.target.value)}
              className="min-h-[220px] bg-background"
              placeholder="Write the default summary the app should reuse before any job-specific tailoring happens."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
          Edit the essentials here, then save. Use the advanced drawers below only when you want to tune detailed skills, full experience history, or hand-maintained projects.
        </div>
      </CardContent>
    </Card>
  );
};

type SnapshotProps = {
  effectiveProfileLoading: boolean;
  profile: ResumeProfile | null;
  hasInternalProfile: boolean;
  effectiveSkillTags: string[];
  formatLocation: (profile: ResumeProfile | null) => string;
};

export const ProfileHubSnapshot: React.FC<SnapshotProps> = ({
  effectiveProfileLoading,
  profile,
  hasInternalProfile,
  effectiveSkillTags,
  formatLocation,
}) => {
  return (
    <Card className="sticky top-6">
      <CardHeader>
        <CardTitle>Current effective snapshot</CardTitle>
        <CardDescription>
          The compact version of what JobOps will actually use right now.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {effectiveProfileLoading ? (
          <div className="text-sm text-muted-foreground">Loading effective profile...</div>
        ) : profile ? (
          <>
            <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-semibold">{profile.basics?.name || "Unnamed profile"}</div>
                <Badge variant="secondary">
                  {hasInternalProfile ? "Internal profile active" : "Fallback profile active"}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {profile.basics?.headline || profile.basics?.label || "No headline"}
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {profile.basics?.email ? <span>{profile.basics.email}</span> : null}
                {formatLocation(profile) ? <span>{formatLocation(profile)}</span> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background p-4 text-sm leading-6 text-foreground/90">
              {profile.sections?.summary?.content || profile.basics?.summary || "No summary yet."}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Effective skill tags
              </div>
              <div className="flex flex-wrap gap-2">
                {effectiveSkillTags.filter(Boolean).slice(0, 20).map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
                {effectiveSkillTags.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No effective skills yet.</span>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No effective profile is available yet.</div>
        )}
      </CardContent>
    </Card>
  );
};
