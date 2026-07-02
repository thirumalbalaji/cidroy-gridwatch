export interface TimestampedStatus {
  status: string;
  ts: Date;
}

export function newestStatus(current: TimestampedStatus | null, candidate: TimestampedStatus): TimestampedStatus {
  if (!current) {
    return candidate;
  }

  return candidate.ts.getTime() >= current.ts.getTime() ? candidate : current;
}
