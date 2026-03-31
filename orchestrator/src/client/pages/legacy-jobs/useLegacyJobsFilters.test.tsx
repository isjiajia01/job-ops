import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DEFAULT_SORT } from "./constants";
import { useLegacyJobsFilters } from "./useLegacyJobsFilters";

const createWrapper = (initialEntry: string) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  );
  Wrapper.displayName = "RouterWrapper";
  return Wrapper;
};

describe("useLegacyJobsFilters", () => {
  it("parses a valid sort query param", () => {
    const { result } = renderHook(() => useLegacyJobsFilters(), {
      wrapper: createWrapper("/ready?sort=title-asc"),
    });

    expect(result.current.sort).toEqual({
      key: "title",
      direction: "asc",
    });
  });

  it("falls back to default sort for invalid sort query params", () => {
    const cases = [
      "/ready?sort=title",
      "/ready?sort=invalid-asc",
      "/ready?sort=title-sideways",
    ];

    for (const entry of cases) {
      const { result } = renderHook(() => useLegacyJobsFilters(), {
        wrapper: createWrapper(entry),
      });
      expect(result.current.sort).toEqual(DEFAULT_SORT);
    }
  });
});
