import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidWebhookSignature(body: unknown, signature: string | undefined): boolean {
  if (!signature) {
    return false;
  }

  const secret = process.env.CSMS_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(signature.replace(/^sha256=/, ""));

  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
