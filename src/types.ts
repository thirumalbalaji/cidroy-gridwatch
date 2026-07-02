export type CountryCode = "IN" | "DE";

export type CurrencyCode = "INR" | "EUR";

export type VendorEvent =
  | VendorStatusEvent
  | VendorMeterValueEvent
  | VendorFaultEvent
  | VendorSessionEvent;

export interface VendorStatusEvent {
  type: "status";
  charger_id: string;
  connector_id: string;
  status: string;
  ts: string;
}

export interface VendorMeterValueEvent {
  type: "meter_value";
  charger_id: string;
  connector_id: string;
  energy_register_wh: number;
  power_w: number;
  ts: string;
}

export interface VendorFaultEvent {
  type: "fault";
  charger_id: string;
  connector_id: string;
  code: string;
  severity: "info" | "warning" | "critical" | string;
  ts: string;
}

export interface VendorSessionEvent {
  type: "session";
  event: "session.start" | "session.stop";
  charger_id: string;
  connector_id: string;
  session_id: string;
  start_meter_wh: number;
  stop_meter_wh?: number;
  ts: string;
}

export interface NormalizedEventBase {
  eventHash: string;
  source: "poll" | "webhook" | "fixture";
  deliveryId?: string;
  chargerId: string;
  connectorId: string;
  vendorTs: Date;
  vendorTsRaw: string;
  raw: VendorEvent;
}

export type NormalizedEvent =
  | NormalizedStatusEvent
  | NormalizedMeterValueEvent
  | NormalizedFaultEvent
  | NormalizedSessionEvent;

export interface NormalizedStatusEvent extends NormalizedEventBase {
  kind: "status";
  status: string;
}

export interface NormalizedMeterValueEvent extends NormalizedEventBase {
  kind: "meter_value";
  energyRegisterWh: number;
  powerW: number;
}

export interface NormalizedFaultEvent extends NormalizedEventBase {
  kind: "fault";
  code: string;
  severity: string;
}

export interface NormalizedSessionEvent extends NormalizedEventBase {
  kind: "session";
  sessionEvent: "session.start" | "session.stop";
  sessionId: string;
  startMeterWh: number;
  stopMeterWh?: number;
}

export interface IngestBatchInput {
  source: "poll" | "webhook" | "fixture";
  deliveryId?: string;
  events: unknown[];
}

export interface IngestSummary {
  received: number;
  accepted: number;
  duplicates: number;
  deadLettered: number;
}

export interface SettlementResult {
  energyWh: number | null;
  billingStatus: "billable" | "incomplete" | "meter_reset_review";
  currency: CurrencyCode;
  amountMinor: number | null;
  anomalyReason: string | null;
}
