/** Provider history is evidence, never a new inbox event or permission to send. */
export function historyPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^([1-9][0-9]{6,14})@(c\.us|s\.whatsapp\.net)$/);
  if (!match) return null;
  return `+${match[1]}`;
}
export function historyDate(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const milliseconds = value < 1e11 ? value * 1000 : value;
  if (milliseconds > Date.now() + 300_000) return null;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date : null;
}
export function parseHistoryMessage(value: unknown, baseUrl: string) {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  const createdAt = historyDate(message.timestamp);
  if (typeof message.id !== "string" || !message.id.trim() || message.id.length > 1024 || typeof message.fromMe !== "boolean" || !createdAt) return null;
  if (message.body != null && typeof message.body !== "string") return null;
  const media = message.media && typeof message.media === "object" ? message.media as Record<string, unknown> : {};
  const mime = typeof media.mimetype === "string" ? media.mimetype : "";
  const contentType = message.hasMedia === true ? mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : "document" : "text";
  let mediaUrl: string | null = null;
  if (message.hasMedia === true && typeof media.url === "string") {
    try {
      const url = new URL(media.url, baseUrl);
      if (url.origin === new URL(baseUrl).origin && /^\/api\/files\/[a-zA-Z0-9_./%-]+$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password && !/%2e|%2f|%5c/i.test(url.pathname)) mediaUrl = url.toString();
    } catch { /* Missing cached media remains explicitly unavailable. */ }
  }
  const ack = typeof message.ack === "number" && Number.isInteger(message.ack) && message.ack >= -1 && message.ack <= 4 ? message.ack : null;
  const statuses = { "-1": ["failed", -1], "0": ["queued", 0], "1": ["sent", 10], "2": ["delivered", 20], "3": ["read", 30], "4": ["read", 30] } as const;
  const status = message.fromMe && ack !== null ? statuses[String(ack) as keyof typeof statuses] : ["unknown", 0] as const;
  return { id: message.id, outbound: message.fromMe, createdAt, contentType, mediaUrl, ack,
    body: (typeof message.body === "string" ? message.body : "").slice(0, 100_000) || (message.hasMedia === true ? (mediaUrl ? "" : "[Mídia do histórico indisponível]") : ""),
    deliveryStatus: status[0], statusRank: status[1] };
}
