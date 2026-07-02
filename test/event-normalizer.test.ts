import { describe, expect, it } from "vitest";
import { normalizeVendorEvent } from "../src/ingestion/event-normalizer";
import { duplicateWebhookBatch, malformedPollPage, normalWebhookBatch } from "../src/fixtures/csms-stub-payloads";

describe("normalizeVendorEvent", () => {
  it("dead-letters malformed vendor events instead of throwing", () => {
    const first = normalizeVendorEvent({ source: "poll", raw: malformedPollPage.events[0] });
    const second = normalizeVendorEvent({ source: "poll", raw: malformedPollPage.events[1] });

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
  });

  it("fingerprints duplicate session.stop events independent of webhook delivery id", () => {
    const original = normalizeVendorEvent({ source: "webhook", deliveryId: "dlv-001", raw: normalWebhookBatch.events[1] });
    const duplicate = normalizeVendorEvent({
      source: "webhook",
      deliveryId: "dlv-002",
      raw: duplicateWebhookBatch.events[0]
    });

    expect(original.ok).toBe(true);
    expect(duplicate.ok).toBe(true);

    if (original.ok && duplicate.ok) {
      expect(duplicate.event.eventHash).toBe(original.event.eventHash);
    }
  });
});
