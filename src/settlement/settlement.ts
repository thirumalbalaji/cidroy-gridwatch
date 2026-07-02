import { CountryCode, CurrencyCode, SettlementResult } from "../types";

export interface Tariff {
  currency: CurrencyCode;
  pricePerKwhMinor: number;
  sessionFeeMinor: number;
}

export const DEFAULT_TARIFFS: Record<CountryCode, Tariff> = {
  IN: { currency: "INR", pricePerKwhMinor: 1800, sessionFeeMinor: 1000 },
  DE: { currency: "EUR", pricePerKwhMinor: 59, sessionFeeMinor: 49 }
};

export function computeSettlement(
  startMeterWh: number | null | undefined,
  stopMeterWh: number | null | undefined,
  tariff: Tariff
): SettlementResult {
  if (startMeterWh === null || startMeterWh === undefined || stopMeterWh === null || stopMeterWh === undefined) {
    return {
      energyWh: null,
      billingStatus: "incomplete",
      currency: tariff.currency,
      amountMinor: null,
      anomalyReason: "missing start or stop meter value"
    };
  }

  if (stopMeterWh < startMeterWh) {
    return {
      energyWh: null,
      billingStatus: "meter_reset_review",
      currency: tariff.currency,
      amountMinor: null,
      anomalyReason: "stop meter is lower than start meter; likely meter reset or replacement"
    };
  }

  const energyWh = stopMeterWh - startMeterWh;
  const energyChargeMinor = Math.round((energyWh / 1000) * tariff.pricePerKwhMinor);

  return {
    energyWh,
    billingStatus: "billable",
    currency: tariff.currency,
    amountMinor: energyChargeMinor + tariff.sessionFeeMinor,
    anomalyReason: null
  };
}
