import { Plus, Trash2 } from "lucide-react";
import type React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  ExperienceFormItem,
  ProjectFormItem,
  SkillFormItem,
} from "./types";

type Props = {
  skills: SkillFormItem[];
  experience: ExperienceFormItem[];
  projects: ProjectFormItem[];
  createFormItemId: (prefix: string) => string;
  setSkills: React.Dispatch<React.SetStateAction<SkillFormItem[]>>;
  setExperience: React.Dispatch<React.SetStateAction<ExperienceFormItem[]>>;
  setProjects: React.Dispatch<React.SetStateAction<ProjectFormItem[]>>;
};

export const AdvancedProfileAccordions: React.FC<Props> = ({
  skills,
  experience,
  projects,
  createFormItemId,
  setSkills,
  setExperience,
  setProjects,
}) => {
  return (
    <Accordion type="multiple" className="space-y-4">
      <AccordionItem value="advanced-profile" className="rounded-2xl border border-border/60 px-0">
        <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
          <div>
            <div className="font-medium">Advanced profile details</div>
            <div className="text-sm text-muted-foreground">
              Skills, full experience, and manual projects — useful, but not needed every time.
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-6 px-6 pb-6">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Skills</CardTitle>
                <CardDescription>Group capabilities the AI should reuse consistently.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSkills((current) => [
                    ...current,
                    { id: createFormItemId("skill"), name: "", keywordsText: "" },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add skill group
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {skills.map((item) => (
                <div key={item.id} className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Skill group"
                      value={item.name}
                      onChange={(event) =>
                        setSkills((current) =>
                          current.map((entry) =>
                            entry.id === item.id ? { ...entry, name: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setSkills((current) => current.filter((entry) => entry.id !== item.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    placeholder="Keywords, comma separated"
                    value={item.keywordsText}
                    onChange={(event) =>
                      setSkills((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, keywordsText: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Experience</CardTitle>
                <CardDescription>Keep the roles that matter for tailoring and evidence selection.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setExperience((current) => [
                    ...current,
                    {
                      id: createFormItemId("experience"),
                      company: "",
                      position: "",
                      location: "",
                      date: "",
                      summary: "",
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add experience
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {experience.map((item) => (
                <div key={item.id} className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Company" value={item.company} onChange={(event) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, company: event.target.value } : entry))} />
                    <Input placeholder="Position" value={item.position} onChange={(event) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, position: event.target.value } : entry))} />
                    <Input placeholder="Location" value={item.location} onChange={(event) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, location: event.target.value } : entry))} />
                    <Input placeholder="Date range" value={item.date} onChange={(event) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, date: event.target.value } : entry))} />
                  </div>
                  <Textarea className="min-h-[140px]" placeholder="Summary / bullets" value={item.summary} onChange={(event) => setExperience((current) => current.map((entry) => entry.id === item.id ? { ...entry, summary: event.target.value } : entry))} />
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setExperience((current) => current.filter((entry) => entry.id !== item.id))}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Manual projects</CardTitle>
                <CardDescription>Add curated projects by hand when local import is not enough.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setProjects((current) => [
                    ...current,
                    {
                      id: createFormItemId("project"),
                      name: "",
                      date: "",
                      summary: "",
                      keywordsText: "",
                      url: "",
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add project
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {projects.map((item) => (
                <div key={item.id} className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Project name" value={item.name} onChange={(event) => setProjects((current) => current.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry))} />
                    <Input placeholder="Date range" value={item.date} onChange={(event) => setProjects((current) => current.map((entry) => entry.id === item.id ? { ...entry, date: event.target.value } : entry))} />
                    <Input className="sm:col-span-2" placeholder="Project URL, optional" value={item.url} onChange={(event) => setProjects((current) => current.map((entry) => entry.id === item.id ? { ...entry, url: event.target.value } : entry))} />
                  </div>
                  <Textarea className="min-h-[140px]" placeholder="Project summary" value={item.summary} onChange={(event) => setProjects((current) => current.map((entry) => entry.id === item.id ? { ...entry, summary: event.target.value } : entry))} />
                  <Textarea placeholder="Keywords, comma separated" value={item.keywordsText} onChange={(event) => setProjects((current) => current.map((entry) => entry.id === item.id ? { ...entry, keywordsText: event.target.value } : entry))} />
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setProjects((current) => current.filter((entry) => entry.id !== item.id))}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="ops-help" className="rounded-2xl border border-border/60 px-0">
        <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
          <div>
            <div className="font-medium">Import, sync, and safety notes</div>
            <div className="text-sm text-muted-foreground">
              JSON round-trips, effective profile refresh, and what save actually does.
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 px-6 pb-6 text-sm text-muted-foreground">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <span className="font-medium text-foreground">Save Profile</span> persists both your editable profile and AI facts.
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <span className="font-medium text-foreground">Upload JSON</span> only updates the current page state first. Nothing is overwritten until you save.
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <span className="font-medium text-foreground">Refresh Effective Profile</span> reloads the current downstream source so you can compare what the rest of the app sees.
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            JSON import expects one candidate bundle containing basics, summary, skills, experience, projects, and facts.
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
