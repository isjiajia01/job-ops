import { Plus } from "lucide-react";
import type React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FIXED_FACT_SLOTS } from "./constants";
import type { FactFormItem } from "./types";

type Props = {
  facts: FactFormItem[];
  extraFacts: FactFormItem[];
  softFacts: FactFormItem[];
  getFixedFactValue: (fact: (typeof FIXED_FACT_SLOTS)[number]) => string;
  onChangeFixedFact: (
    fact: (typeof FIXED_FACT_SLOTS)[number],
    value: string,
  ) => void;
  onAddExtraFact: () => void;
  onAddSoftFact: () => void;
  renderFactEditor: (fact: FactFormItem, options?: { pinned?: boolean }) => React.ReactNode;
};

export const FixedFactSlotsSection: React.FC<Props> = ({
  extraFacts,
  softFacts,
  getFixedFactValue,
  onChangeFixedFact,
  onAddExtraFact,
  onAddSoftFact,
  renderFactEditor,
}) => {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>High-signal facts</CardTitle>
        <CardDescription>
          Fixed slots for the five pieces of context that most improve CV and cover-letter quality.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {FIXED_FACT_SLOTS.map((slot) => (
            <div
              key={slot.key}
              className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4"
            >
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">{slot.title}</div>
                <div className="text-xs leading-5 text-muted-foreground">{slot.description}</div>
              </div>
              <Textarea
                value={getFixedFactValue(slot)}
                onChange={(event) => onChangeFixedFact(slot, event.target.value)}
                className="min-h-[140px] bg-background"
                placeholder={slot.placeholder}
              />
            </div>
          ))}
        </div>

        <Accordion type="multiple" className="space-y-3">
          <AccordionItem
            value="extra-core-facts"
            className="rounded-xl border border-border/60 bg-muted/5 px-4"
          >
            <AccordionTrigger className="text-sm hover:no-underline">
              Extra reusable facts
              <Badge variant="secondary" className="ml-2">
                {extraFacts.length}
              </Badge>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="text-sm text-muted-foreground">
                Use this only for additional reusable context that does not fit the five primary slots.
              </div>
              <Button variant="outline" size="sm" onClick={onAddExtraFact}>
                <Plus className="mr-2 h-4 w-4" />
                Add extra fact
              </Button>
              {extraFacts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No extra reusable facts yet.</div>
              ) : (
                extraFacts.map((fact, index) => renderFactEditor(fact, { pinned: index < 2 }))
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="soft-notes"
            className="rounded-xl border border-border/60 bg-muted/5 px-4"
          >
            <AccordionTrigger className="text-sm hover:no-underline">
              Soft personal notes
              <Badge variant="secondary" className="ml-2">
                {softFacts.length}
              </Badge>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="text-sm text-muted-foreground">
                Use these sparingly for tone, working style, and preference context — not hard evidence.
              </div>
              <Button variant="outline" size="sm" onClick={onAddSoftFact}>
                <Plus className="mr-2 h-4 w-4" />
                Add soft note
              </Button>
              {softFacts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No soft notes yet.</div>
              ) : (
                softFacts.map((fact) => renderFactEditor(fact))
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};
