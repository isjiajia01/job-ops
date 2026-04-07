import type { CandidateKnowledgeBase, LocalProjectCandidate, LocalProjectSource } from "@shared/types";
import { RefreshCcw } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  localSourceInput: string;
  onLocalSourceInputChange: (value: string) => void;
  localProjectSources: LocalProjectSource[];
  scannedProjects: LocalProjectCandidate[];
  curatedProjects: CandidateKnowledgeBase["projects"];
  activeProjects: CandidateKnowledgeBase["projects"];
  isScanningProjects: boolean;
  onAddSource: () => void;
  onRemoveSource: (path: string) => void;
  onScan: () => void;
  onImportScannedProject: (project: LocalProjectCandidate) => void;
  onToggleProjectActive: (projectId: string) => void;
  onRemoveKnowledgeProject: (projectId: string) => void;
};

export const ProjectMaterialLibrarySection: React.FC<Props> = ({
  localSourceInput,
  onLocalSourceInputChange,
  localProjectSources,
  scannedProjects,
  curatedProjects,
  activeProjects,
  isScanningProjects,
  onAddSource,
  onRemoveSource,
  onScan,
  onImportScannedProject,
  onToggleProjectActive,
  onRemoveKnowledgeProject,
}) => {
  const curatedIds = new Set([...curatedProjects, ...activeProjects].map((p) => p.id));

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Project material library</CardTitle>
        <CardDescription>
          Separate raw candidates, imported knowledge, and a small default proof-point preference set used before any per-job selection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="~/Code or /Users/zhangjiajia/Life-OS/10-19 Personal/11_Project"
              value={localSourceInput}
              onChange={(event) => onLocalSourceInputChange(event.target.value)}
            />
            <Button onClick={onAddSource}>Add source</Button>
          </div>

          <div className="space-y-2">
            {localProjectSources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-sm text-muted-foreground">
                No local folders connected yet.
              </div>
            ) : (
              localProjectSources.map((source) => (
                <div
                  key={source.path}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                >
                  <div className="truncate">{source.path}</div>
                  <Button variant="ghost" size="sm" onClick={() => onRemoveSource(source.path)}>
                    Remove
                  </Button>
                </div>
              ))
            )}
          </div>

          <Button variant="outline" className="w-full" onClick={onScan} disabled={isScanningProjects || localProjectSources.length === 0}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {isScanningProjects ? "Scanning local projects..." : "Scan local project candidates"}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 rounded-2xl border border-border/60 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Scanned candidates</div>
                <div className="text-xs text-muted-foreground">Raw local discoveries waiting for review.</div>
              </div>
              <Badge variant="outline">{scannedProjects.length}</Badge>
            </div>
            <div className="space-y-3">
              {scannedProjects.length === 0 ? (
                <div className="text-sm text-muted-foreground">Run a scan to see candidate projects.</div>
              ) : (
                scannedProjects.map((project) => {
                  const alreadyImported = curatedIds.has(project.id);
                  return (
                    <div key={project.id} className="rounded-xl border border-border/60 bg-muted/10 p-3">
                      <div className="font-medium text-sm">{project.name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{project.path}</div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">{project.summary}</div>
                      <Button
                        size="sm"
                        variant={alreadyImported ? "secondary" : "outline"}
                        disabled={alreadyImported}
                        className="mt-3 w-full"
                        onClick={() => onImportScannedProject(project)}
                      >
                        {alreadyImported ? "Imported" : "Import to knowledge"}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/60 bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Imported knowledge</div>
                <div className="text-xs text-muted-foreground">Projects saved in your reusable candidate library.</div>
              </div>
              <Badge variant="outline">{curatedProjects.length}</Badge>
            </div>
            <div className="space-y-3">
              {curatedProjects.length === 0 ? (
                <div className="text-sm text-muted-foreground">No curated projects yet.</div>
              ) : (
                curatedProjects.map((project) => (
                  <div key={project.id} className="rounded-xl border border-border/60 bg-muted/10 p-3">
                    <div className="font-medium text-sm">{project.name}</div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">{project.summary}</div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => onToggleProjectActive(project.id)}>
                        Set as default
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onRemoveKnowledgeProject(project.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground">Default proof-point preferences</div>
                <div className="text-xs text-muted-foreground">A fallback preference set used only before any per-job override.</div>
              </div>
              <Badge variant="secondary">{activeProjects.length}</Badge>
            </div>
            <div className="space-y-3">
              {activeProjects.length === 0 ? (
                <div className="text-sm text-muted-foreground">No default proof-point preferences selected yet.</div>
              ) : (
                activeProjects.map((project) => (
                  <div key={project.id} className="rounded-xl border border-emerald-200/70 bg-background/80 p-3 dark:border-emerald-900/60">
                    <div className="font-medium text-sm">{project.name}</div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">{project.summary}</div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => onToggleProjectActive(project.id)}>
                        Remove default
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onRemoveKnowledgeProject(project.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
