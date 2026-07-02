export type PollDecision =
  | { kind: "ok" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "transient_error"; statusCode: number; requestId?: string }
  | { kind: "fatal_error"; statusCode: number; reason: string };

export function classifyPollResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string | string[] | undefined> = {}
): PollDecision {
  if (statusCode === 429) {
    const retryAfterHeader = firstHeader(headers["retry-after"]);
    const retryAfterBody =
      typeof body === "object" && body ? Number((body as { retry_after_seconds?: unknown }).retry_after_seconds) : NaN;
    const retryAfterSeconds = Number.isFinite(Number(retryAfterHeader))
      ? Number(retryAfterHeader)
      : Number.isFinite(retryAfterBody)
        ? retryAfterBody
        : 30;
    return { kind: "rate_limited", retryAfterSeconds };
  }

  if (statusCode >= 500 && statusCode <= 599) {
    const requestId =
      typeof body === "object" && body && typeof (body as { request_id?: unknown }).request_id === "string"
        ? (body as { request_id: string }).request_id
        : undefined;
    return { kind: "transient_error", statusCode, requestId };
  }

  if (statusCode >= 200 && statusCode <= 299) {
    return { kind: "ok" };
  }

  return { kind: "fatal_error", statusCode, reason: "unexpected non-retryable response from CSMS" };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
