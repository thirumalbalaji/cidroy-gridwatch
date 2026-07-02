import { describe, expect, it } from "vitest";
import { newestStatus } from "../src/ingestion/status-reducer";

describe("newestStatus", () => {
  it("keeps the newest vendor timestamp even when an older status is received later", () => {
    const current = newestStatus(null, {
      status: "Available",
      ts: new Date("2026-06-09T14:33:40+05:30")
    });
    const result = newestStatus(current, {
      status: "Charging",
      ts: new Date("2026-06-09T14:31:50+05:30")
    });

    expect(result.status).toBe("Available");
  });
});
