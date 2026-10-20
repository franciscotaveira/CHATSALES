import pino from "pino";

/** URLs may contain media authentication or ingress capabilities; never log their values. */
export function sanitizeSensitiveUrl(raw: unknown): string {
  if(typeof raw!=="string")return "";
  return raw.replace(/\/v1\/webhooks\/whatsapp\/[^/?#]+/g,"/v1/webhooks/whatsapp/[redacted]")
    .replace(/([?&#](?:token|auth|access_token|api_key|secret)=)[^&#\s]*/gi,"$1[redacted]");
}

export interface LoggerOptions {
  serviceName?: string;
  level?: string;
}

export function createLogger(options: LoggerOptions = {}) {
  const isDev = process.env.NODE_ENV !== "production";

  return pino({
    name: options.serviceName || process.env.OTEL_SERVICE_NAME || "sos-sales-v3",
    level: options.level || process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
    serializers: {
      req(req: any) {
        const rawUrl = req.raw?.url || req.url || "";
        const sanitizedUrl = sanitizeSensitiveUrl(rawUrl);
        return {
          id: req.id,
          method: req.method,
          url: sanitizedUrl,
          query: req.query,
          parameters: req.params,
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
      err(err: any) {
        const msg = typeof err?.message === "string"
          ? sanitizeSensitiveUrl(err.message)
          : err?.message;
        const stack = typeof err?.stack === "string"
          ? sanitizeSensitiveUrl(err.stack)
          : undefined;
        return {
          type: err?.name,
          message: msg,
          stack,
        };
      },
    },
    redact: {
      censor: "[REDACTED_BY_SOVEREIGN_POLICY]",
      paths: [
        "endpointToken","*.endpointToken","*.*.endpointToken",
        "access_token","*.access_token","*.*.access_token",
        "api_key","*.api_key","*.*.api_key",
        "token",
        "*.token",
        "*.*.token",
        "password",
        "*.password",
        "secret",
        "*.secret",
        "apiKey",
        "*.apiKey",
        "authorization",
        "*.authorization",
        "headers.authorization",
        "req.headers.authorization",
        "accessToken",
        "*.accessToken",
        "appSecret",
        "*.appSecret",
        "payload",
        "*.payload",
        "*.*.payload",
        "claims",
        "*.claims",
        "email",
        "*.email",
        "sub",
        "*.sub",
        "connectionString",
        "*.connectionString",
      ],
    },
    transport: isDev
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "HH:MM:ss Z",
          },
        }
      : undefined,
  });
}

export const logger = createLogger();
