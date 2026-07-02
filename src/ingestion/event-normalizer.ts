import { createHash } from "node:crypto";
import { z } from "zod";
import { NormalizedEvent, VendorEvent } from "../types";
import { stableJson } from "./stable-json";

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "ts must be an ISO timestamp with offset"
});

const statusSchema = z.object({
  type: z.literal("status"),
  charger_id: z.string().min(1),
  connector_id: z.string().min(1),
  status: z.string().min(1),
  ts: timestamp
});

const meterValueSchema = z.object({
  type: z.literal("meter_value"),
  charger_id: z.string().min(1),
  connector_id: z.string().min(1),
  energy_register_wh: z.number().int().nonnegative(),
  power_w: z.number().int().nonnegative(),
  ts: timestamp
});

const faultSchema = z.object({
  type: z.literal("fault"),
  charger_id: z.string().min(1),
  connector_id: z.string().min(1),
  code: z.string().min(1),
  severity: z.string().min(1),
  ts: timestamp
});

const sessionSchema = z
  .object({
    type: z.literal("session"),
    event: z.enum(["session.start", "session.stop"]),
    charger_id: z.string().min(1),
    connector_id: z.string().min(1),
    session_id: z.string().min(1),
    start_meter_wh: z.number().int().nonnegative(),
    stop_meter_wh: z.number().int().nonnegative().optional(),
    ts: timestamp
  })
  .superRefine((event, ctx) => {
    if (event.event === "session.stop" && event.stop_meter_wh === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stop_meter_wh"],
        message: "session.stop requires stop_meter_wh"
      });
    }
  });

export interface NormalizeInput {
  source: "poll" | "webhook" | "fixture";
  deliveryId?: string;
  raw: unknown;
}

export type NormalizeResult =
  | { ok: true; event: NormalizedEvent }
  | { ok: false; reason: string; raw: unknown };

export function normalizeVendorEvent(input: NormalizeInput): NormalizeResult {
  const rawType = typeof input.raw === "object" && input.raw ? (input.raw as { type?: unknown }).type : undefined;
  const schema = schemaForType(rawType);

  if (!schema) {
    return { ok: false, reason: "unsupported or missing event type", raw: input.raw };
  }

  const parsed = schema.safeParse(input.raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      raw: input.raw
    };
  }

  const raw = parsed.data as VendorEvent;
  const eventHash = fingerprintVendorEvent(raw);
  const base = {
    eventHash,
    source: input.source,
    deliveryId: input.deliveryId,
    chargerId: raw.charger_id,
    connectorId: raw.connector_id,
    vendorTs: new Date(raw.ts),
    vendorTsRaw: raw.ts,
    raw
  };

  switch (raw.type) {
    case "status":
      return { ok: true, event: { ...base, kind: "status", status: normalizeStatus(raw.status) } };
    case "meter_value":
      return {
        ok: true,
        event: {
          ...base,
          kind: "meter_value",
          energyRegisterWh: raw.energy_register_wh,
          powerW: raw.power_w
        }
      };
    case "fault":
      return { ok: true, event: { ...base, kind: "fault", code: raw.code, severity: raw.severity } };
    case "session":
      return {
        ok: true,
        event: {
          ...base,
          kind: "session",
          sessionEvent: raw.event,
          sessionId: raw.session_id,
          startMeterWh: raw.start_meter_wh,
          stopMeterWh: raw.stop_meter_wh
        }
      };
  }
}

function schemaForType(rawType: unknown) {
  switch (rawType) {
    case "status":
      return statusSchema;
    case "meter_value":
      return meterValueSchema;
    case "fault":
      return faultSchema;
    case "session":
      return sessionSchema;
    default:
      return null;
  }
}

export function fingerprintVendorEvent(raw: VendorEvent): string {
  return createHash("sha256").update(stableJson(raw)).digest("hex");
}

export function normalizeStatus(status: string): string {
  const compact = status.trim().toLowerCase();
  if (compact === "available") return "Available";
  if (compact === "charging") return "Charging";
  if (compact === "faulted" || compact === "fault") return "Faulted";
  if (compact === "offline" || compact === "unavailable") return "Offline";
  return status.trim();
}
