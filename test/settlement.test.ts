import { describe, expect, it } from "vitest";
import { computeSettlement, DEFAULT_TARIFFS } from "../src/settlement/settlement";

describe("computeSettlement", () => {
  it("computes billable energy from cumulative register deltas", () => {
    const result = computeSettlement(9930120, 9971540, DEFAULT_TARIFFS.DE);

    expect(result.billingStatus).toBe("billable");
    expect(result.energyWh).toBe(41420);
    expect(result.currency).toBe("EUR");
    expect(result.amountMinor).toBe(2493);
  });

  it("flags meter resets instead of producing negative bills", () => {
    const result = computeSettlement(12044990, 31200, DEFAULT_TARIFFS.IN);

    expect(result.billingStatus).toBe("meter_reset_review");
    expect(result.energyWh).toBeNull();
    expect(result.amountMinor).toBeNull();
  });
});
