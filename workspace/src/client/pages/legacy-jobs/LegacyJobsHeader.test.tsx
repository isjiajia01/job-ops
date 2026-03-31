import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LegacyJobsHeader } from "./LegacyJobsHeader";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const renderHeader = (
  overrides: Partial<React.ComponentProps<typeof LegacyJobsHeader>> = {},
) => {
  const props: React.ComponentProps<typeof LegacyJobsHeader> = {
    navOpen: false,
    onNavOpenChange: vi.fn(),
    isPipelineRunning: false,
    isCancelling: false,
    pipelineSources: ["gradcracker"],
    onOpenAutomaticRun: vi.fn(),
    onOpenManualImport: vi.fn(),
    onCancelPipeline: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(
      <MemoryRouter>
        <LegacyJobsHeader {...props} />
      </MemoryRouter>,
    ),
  };
};

describe("LegacyJobsHeader", () => {
  it("opens automatic run from the navbar button", () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /run pipeline/i }));
    expect(props.onOpenAutomaticRun).toHaveBeenCalled();
  });

  it("opens manual import from the paste jd button", () => {
    const { props } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: /paste jd/i }));
    expect(props.onOpenManualImport).toHaveBeenCalled();
  });

  it("renders cancel button while running and triggers cancel", () => {
    const { props } = renderHeader({ isPipelineRunning: true });
    fireEvent.click(screen.getByRole("button", { name: /cancel run/i }));
    expect(props.onCancelPipeline).toHaveBeenCalled();
  });
});
