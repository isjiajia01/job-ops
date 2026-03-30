import { createJob } from "@shared/testing/factories.js";
import type { Application } from "@shared/types.js";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { _resetTracerReadinessCache } from "../hooks/useTracerReadiness";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { ApplicationDetailsEditDrawer } from "./ApplicationDetailsEditDrawer";

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

vi.mock("../api", () => ({
  updateApplication: vi.fn(),
  checkSponsor: vi.fn(),
  rescoreJob: vi.fn(),
  getTracerReadiness: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ApplicationDetailsEditDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetTracerReadinessCache();
    vi.mocked(api.getTracerReadiness).mockResolvedValue({
      status: "ready",
      canEnable: true,
      publicBaseUrl: "https://my-jobops.example.com",
      healthUrl: "https://my-jobops.example.com/health",
      checkedAt: Date.now(),
      lastSuccessAt: Date.now(),
      reason: null,
    });
  });

  it("saves details and reruns sponsor check when employer changes", async () => {
    const onApplicationUpdated = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    vi.mocked(api.updateApplication).mockResolvedValue({} as Application);
    vi.mocked(api.checkSponsor).mockResolvedValue({} as Application);

    render(
      <ApplicationDetailsEditDrawer
        open
        onOpenChange={onOpenChange}
        application={createJob()}
        onApplicationUpdated={onApplicationUpdated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Employer *"), {
      target: { value: "NewCo" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() =>
      expect(api.updateApplication).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          employer: "NewCo",
          title: "Backend Engineer",
        }),
      ),
    );
    expect(api.checkSponsor).toHaveBeenCalledWith("job-1");
    expect(onApplicationUpdated).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("validates required fields before saving", async () => {
    const onApplicationUpdated = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ApplicationDetailsEditDrawer
        open
        onOpenChange={onOpenChange}
        application={createJob()}
        onApplicationUpdated={onApplicationUpdated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title *"), {
      target: { value: "   " },
    });

    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(api.updateApplication).not.toHaveBeenCalled();
    expect(onApplicationUpdated).not.toHaveBeenCalled();
  });

  it("offers a rescore action after successful save", async () => {
    const onApplicationUpdated = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const { toast } = await import("sonner");
    vi.mocked(api.updateApplication).mockResolvedValue({} as Application);
    vi.mocked(api.rescoreJob).mockResolvedValue({} as Application);

    render(
      <ApplicationDetailsEditDrawer
        open
        onOpenChange={onOpenChange}
        application={createJob()}
        onApplicationUpdated={onApplicationUpdated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Salary"), {
      target: { value: "GBP 90k" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        "Application details updated",
        expect.any(Object),
      ),
    );

    const successCalls = vi.mocked(toast.success).mock.calls;
    const [, payload] =
      successCalls.find((call) => call[0] === "Application details updated") ?? [];
    expect(payload).toBeTruthy();

    (payload as { action?: { onClick?: () => void } }).action?.onClick?.();

    await waitFor(() => expect(api.rescoreJob).toHaveBeenCalledWith("job-1"));
    expect(onApplicationUpdated).toHaveBeenCalledTimes(2);
  });

  it("persists tracer-links toggle with job updates", async () => {
    const onApplicationUpdated = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    vi.mocked(api.updateApplication).mockResolvedValue({} as Application);

    render(
      <ApplicationDetailsEditDrawer
        open
        onOpenChange={onOpenChange}
        application={createJob({ tracerLinksEnabled: false })}
        onApplicationUpdated={onApplicationUpdated}
      />,
    );

    await waitFor(() => expect(api.getTracerReadiness).toHaveBeenCalled());
    const tracerToggle = await screen.findByRole("checkbox", {
      name: "Enable tracer links for this application",
    });
    await waitFor(() => expect(tracerToggle).toBeEnabled());
    fireEvent.click(tracerToggle);
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() =>
      expect(api.updateApplication).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          tracerLinksEnabled: true,
        }),
      ),
    );
  });
});
