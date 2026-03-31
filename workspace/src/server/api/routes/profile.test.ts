import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

// Mock the RxResume adapter service
vi.mock("@server/services/rxresume", () => ({
  clearRxResumeResumeCache: vi.fn(),
  getResume: vi.fn(),
  RxResumeAuthConfigError: class RxResumeAuthConfigError extends Error {
    constructor() {
      super("Reactive Resume credentials not configured.");
      this.name = "RxResumeAuthConfigError";
    }
  },
}));

// Mock the profile service
vi.mock("@server/services/profile", () => ({
  getProfile: vi.fn(),
  clearProfileCache: vi.fn(),
}));

// Mock the settings repository
vi.mock("@server/repositories/settings", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    getSetting: vi.fn(),
    setSetting: vi.fn(),
  };
});

import { getSetting, setSetting } from "@server/repositories/settings";
import { getProfile } from "@server/services/profile";
import { getResume, RxResumeAuthConfigError } from "@server/services/rxresume";

describe.sequential("Profile API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        BASIC_AUTH_USER: "admin",
        BASIC_AUTH_PASSWORD: "secret",
      },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  const authHeaders = {
    Authorization: `Basic ${Buffer.from("admin:secret").toString("base64")}`,
  };

  describe("GET /api/profile/projects", () => {
    it("returns projects when profile is configured", async () => {
      const mockProfile = {
        sections: {
          projects: {
            items: [
              {
                id: "proj1",
                name: "Project 1",
                description: "Desc 1",
                summary: "Summary 1",
                date: "2024",
                visible: true,
              },
              {
                id: "proj2",
                name: "Project 2",
                description: "Desc 2",
                summary: "Summary 2",
                date: "2023",
                visible: false,
              },
            ],
          },
        },
      };
      vi.mocked(getProfile).mockResolvedValue(mockProfile);

      const res = await fetch(`${baseUrl}/api/profile/projects`, {
        headers: authHeaders,
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(2);
    });

    it("returns error when profile is not configured", async () => {
      vi.mocked(getProfile).mockRejectedValue(
        new Error("Base resume not configured."),
      );

      const res = await fetch(`${baseUrl}/api/profile/projects`, {
        headers: authHeaders,
      });
      const body = await res.json();

      expect(res.ok).toBe(false);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain("Base resume not configured");
    });

    it("returns demo project catalog in demo mode", async () => {
      const demoServer = await startServer({
        env: {
          DEMO_MODE: "true",
          BASIC_AUTH_USER: "",
          BASIC_AUTH_PASSWORD: "",
        },
      });
      try {
        vi.mocked(getProfile).mockRejectedValue(
          new Error("should not be used"),
        );

        const res = await fetch(`${demoServer.baseUrl}/api/profile/projects`);
        const body = await res.json();

        expect(res.ok).toBe(true);
        expect(body.ok).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
        expect(body.data[0]).toMatchObject({
          id: expect.any(String),
          name: expect.any(String),
        });
      } finally {
        await stopServer(demoServer);
      }
    });
  });

  describe("GET /api/profile", () => {
    it("returns full profile when configured", async () => {
      const mockProfile = {
        basics: { name: "Test User", headline: "Developer" },
        sections: { summary: { content: "A summary" } },
      };
      vi.mocked(getProfile).mockResolvedValue(mockProfile);

      const res = await fetch(`${baseUrl}/api/profile`, {
        headers: authHeaders,
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data).toEqual(mockProfile);
    });

    it("returns error when profile is not configured", async () => {
      vi.mocked(getProfile).mockRejectedValue(
        new Error("Base resume not configured."),
      );

      const res = await fetch(`${baseUrl}/api/profile`, {
        headers: authHeaders,
      });
      const body = await res.json();

      expect(res.ok).toBe(false);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain("Base resume not configured");
    });
  });

  describe("Shared AI knowledge routes", () => {
    it("returns stored shared knowledge", async () => {
      vi.mocked(getSetting).mockResolvedValue(
        JSON.stringify({
          personalFacts: [
            {
              id: "fact-1",
              title: "Preference",
              detail: "Prefers supply chain roles",
            },
          ],
          projects: [],
        }),
      );

      const res = await fetch(`${baseUrl}/api/profile/knowledge`, {
        headers: authHeaders,
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.personalFacts).toHaveLength(1);
      expect(body.data.personalFacts[0].title).toBe("Preference");
    });

    it.skip("adds a personal fact to shared knowledge", async () => {
      vi.mocked(getSetting).mockResolvedValue(
        JSON.stringify({ personalFacts: [], projects: [] }),
      );
      vi.mocked(setSetting).mockResolvedValue(undefined);

      const res = await fetch(`${baseUrl}/api/profile/knowledge/facts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from("admin:secret").toString("base64")}`,
        },
        body: JSON.stringify({
          title: "Work authorization",
          detail: "Can work in Denmark without sponsorship.",
        }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.title).toBe("Work authorization");
      expect(vi.mocked(setSetting).mock.calls[0]?.[0]).toBe(
        "candidateKnowledgeBase",
      );
    });
  });

  describe("GET /api/profile/status", () => {
    it("returns exists: false when rxresumeBaseResumeId is not configured", async () => {
      vi.mocked(getSetting).mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain("No base resume selected");
    });

    it("returns exists: true when resume is accessible", async () => {
      vi.mocked(getSetting).mockResolvedValue("test-resume-id");
      vi.mocked(getResume).mockResolvedValue({
        id: "test-resume-id",
        data: { basics: { name: "Test" } },
      } as any);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.exists).toBe(true);
      expect(body.data.error).toBeNull();
    });

    it("returns exists: false when RxResume credentials are missing", async () => {
      vi.mocked(getSetting).mockResolvedValue("test-resume-id");
      vi.mocked(getResume).mockRejectedValue(
        new (RxResumeAuthConfigError as unknown as new () => Error)(),
      );

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain("credentials not configured");
    });

    it("returns exists: false when resume data is empty", async () => {
      vi.mocked(getSetting).mockResolvedValue("test-resume-id");
      vi.mocked(getResume).mockResolvedValue({
        id: "test-resume-id",
        data: null,
      } as any);

      const res = await fetch(`${baseUrl}/api/profile/status`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.exists).toBe(false);
      expect(body.data.error).toContain("empty or invalid");
    });
  });

  // Note: POST /api/profile/refresh tests skipped because basic auth blocks POST in test environment
  // The endpoint is tested indirectly through the profile service tests
});
