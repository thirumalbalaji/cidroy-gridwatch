export const pollFirstPage = {
  site_id: "S-IN-0007",
  server_time: "2026-06-09T14:32:25+05:30",
  next_cursor: "eyJvZmZzZXQiOjUwfQ==",
  events: [
    {
      type: "status",
      charger_id: "C-IN-0007-A",
      connector_id: "1",
      status: "Charging",
      ts: "2026-06-09T14:32:11+05:30"
    },
    {
      type: "meter_value",
      charger_id: "C-IN-0007-A",
      connector_id: "1",
      energy_register_wh: 4821553,
      power_w: 41200,
      ts: "2026-06-09T14:32:11+05:30"
    },
    {
      type: "meter_value",
      charger_id: "C-IN-0007-A",
      connector_id: "1",
      energy_register_wh: 4821667,
      power_w: 41050,
      ts: "2026-06-09T14:32:21+05:30"
    },
    {
      type: "status",
      charger_id: "C-IN-0007-B",
      connector_id: "1",
      status: "Available",
      ts: "2026-06-09T14:32:09+05:30"
    }
  ]
};

export const pollFinalPage = {
  site_id: "S-IN-0007",
  server_time: "2026-06-09T14:32:25+05:30",
  events: [
    {
      type: "fault",
      charger_id: "C-IN-0007-A",
      connector_id: "2",
      code: "OverTemperature",
      severity: "warning",
      ts: "2026-06-09T14:30:55+05:30"
    }
  ]
};

export const malformedPollPage = {
  site_id: "S-DE-0003",
  server_time: "2026-06-09T23:15:02+02:00",
  events: [
    {
      type: "meter_value",
      charger_id: "C-DE-0003-A",
      connector_id: "1",
      energy_register_wh: null,
      power_w: 0,
      ts: "2026-06-09T23:14:58+02:00"
    },
    {
      type: "status",
      charger_id: "C-DE-0003-A",
      ts: "2026-06-09T23:14:58+02:00"
    }
  ]
};

export const normalWebhookBatch = {
  delivery_id: "dlv-001",
  events: [
    {
      type: "session",
      event: "session.start",
      charger_id: "C-DE-0003-A",
      connector_id: "1",
      session_id: "sess-de-99x",
      start_meter_wh: 9930120,
      ts: "2026-06-09T22:41:03+02:00"
    },
    {
      type: "session",
      event: "session.stop",
      charger_id: "C-DE-0003-A",
      connector_id: "1",
      session_id: "sess-de-99x",
      start_meter_wh: 9930120,
      stop_meter_wh: 9971540,
      ts: "2026-06-09T23:14:58+02:00"
    }
  ]
};

export const duplicateWebhookBatch = {
  delivery_id: "dlv-002",
  events: [
    {
      type: "session",
      event: "session.stop",
      charger_id: "C-DE-0003-A",
      connector_id: "1",
      session_id: "sess-de-99x",
      start_meter_wh: 9930120,
      stop_meter_wh: 9971540,
      ts: "2026-06-09T23:14:58+02:00"
    }
  ]
};

export const outOfOrderWebhookBatch = {
  delivery_id: "dlv-003",
  events: [
    {
      type: "session",
      event: "session.stop",
      charger_id: "C-IN-0007-A",
      connector_id: "1",
      session_id: "sess-in-44a",
      start_meter_wh: 4810000,
      stop_meter_wh: 4821667,
      ts: "2026-06-09T14:32:21+05:30"
    },
    {
      type: "status",
      charger_id: "C-IN-0007-A",
      connector_id: "1",
      status: "Available",
      ts: "2026-06-09T14:33:40+05:30"
    },
    {
      type: "status",
      charger_id: "C-IN-0007-A",
      connector_id: "1",
      status: "Charging",
      ts: "2026-06-09T14:31:50+05:30"
    },
    {
      type: "session",
      event: "session.start",
      charger_id: "C-IN-0007-A",
      connector_id: "1",
      session_id: "sess-in-44a",
      start_meter_wh: 4810000,
      ts: "2026-06-09T14:25:02+05:30"
    }
  ]
};

export const meterResetWebhookBatch = {
  delivery_id: "dlv-004",
  events: [
    {
      type: "session",
      event: "session.stop",
      charger_id: "C-IN-0012-A",
      connector_id: "1",
      session_id: "sess-in-77c",
      start_meter_wh: 12044990,
      stop_meter_wh: 31200,
      ts: "2026-06-09T18:40:12+05:30"
    }
  ]
};

export const allFixtureBatches = [
  { source: "poll" as const, events: pollFirstPage.events },
  { source: "poll" as const, events: pollFinalPage.events },
  { source: "poll" as const, events: malformedPollPage.events },
  { source: "webhook" as const, deliveryId: normalWebhookBatch.delivery_id, events: normalWebhookBatch.events },
  { source: "webhook" as const, deliveryId: duplicateWebhookBatch.delivery_id, events: duplicateWebhookBatch.events },
  { source: "webhook" as const, deliveryId: outOfOrderWebhookBatch.delivery_id, events: outOfOrderWebhookBatch.events },
  { source: "webhook" as const, deliveryId: meterResetWebhookBatch.delivery_id, events: meterResetWebhookBatch.events }
];
