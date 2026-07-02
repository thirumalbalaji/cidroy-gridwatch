import { describe, expect, it } from "vitest";
import { classifyPollResponse } from "../src/ingestion/poll-policy";

describe("classifyPollResponse", () => {
  it("uses Retry-After for CSMS rate limits", () => {
    expect(classifyPollResponse(429, { error: "rate_limited", retry_after_seconds: 30 }, { "retry-after": "45" })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 45
    });
  });

  it("treats vendor 500s as transient retryable failures", () => {
    expect(classifyPollResponse(500, { error: "internal", request_id: "req-7f3a9c" })).toEqual({
      kind: "transient_error",
      statusCode: 500,
      requestId: "req-7f3a9c"
    });
  });
});
