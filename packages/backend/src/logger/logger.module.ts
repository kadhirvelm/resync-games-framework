import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import type { LevelWithSilent, LogFn } from "pino";
import { buildPinoTransport } from "./buildPinoTransport";

/**
 * Maps HTTP response status codes to Pino log levels.
 * Used by pinoHttp's customLogLevel to ensure 5xx → error, 4xx → warn.
 * @param res - The HTTP response object
 * @param err - Transport-level error (e.g., client aborted), if any
 * @returns Pino log level string
 */
export function getLogLevel(
  res: ServerResponse,
  err: Error | undefined,
): LevelWithSilent {
  // 5xx errors are already logged with full context by AllExceptionsFilter,
  // so silence the duplicate pinoHttp request-completion log for them.
  if (res.statusCode >= 500) return "silent";
  if (err) return "error";
  if (res.statusCode >= 400) return "warn";
  return "info";
}

/**
 * Cuts the noise from the NestJS bootstrap logs in development so it's easier to debug.
 */
function shouldSkipNestBootstrapLog(args: Parameters<LogFn>): boolean {
  if (process.env.NODE_ENV !== "development") {
    return false;
  }

  const [firstArg, secondArg] = args;
  const message =
    typeof secondArg === "string"
      ? secondArg
      : typeof firstArg === "string"
        ? firstArg
        : undefined;

  if (message == null) {
    return false;
  }

  return (
    message.startsWith("Mapped {") ||
    message.includes("Controller") ||
    message.includes("route") ||
    message.includes("dependencies initialized") ||
    message.includes("Registered handler for job") ||
    message.includes("subscribed to the") ||
    message.includes("Gateway initialized") ||
    message.includes("Creating prisma client")
  );
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        // Define a custom error message for transport-level errors (e.g., client abort, socket hangup).
        customErrorMessage: (_req, _res, err) => {
          return `Request failed: ${err.message}`;
        },
        // Map HTTP status codes to appropriate Pino log levels so log collectors
        // receives errors at 'error' level and client errors at 'warn' level.
        customLogLevel: (
          _req: IncomingMessage,
          res: ServerResponse,
          err?: Error,
        ) => getLogLevel(res, err),
        customProps: () => ({
          context: "HTTP",
        }),
        // Define a custom success message for log entries when requests successfully complete.
        customSuccessMessage: (req, res) => {
          if (res.statusCode === 404) {
            return "Resource not found";
          }
          if (res.statusCode >= 400) {
            return `${req.method} ${req.url} requestId ${req.id} failed with status ${res.statusCode}`;
          }
          return `${req.method} ${req.url} requestId ${req.id} completed`;
        },
        // Use a random UUID for the request ID.
        // This will be available on `req.id`.
        genReqId: (req, res) => {
          const existingId = req.id ?? req.headers["x-request-id"];
          if (existingId) return existingId;
          const id = randomUUID();
          res.setHeader("X-Request-Id", id);
          return id;
        },
        hooks: {
          // Drop noisy Nest bootstrap route/controller registration logs while
          // preserving ordinary application `log()` output.
          logMethod(args, method) {
            if (shouldSkipNestBootstrapLog(args)) {
              return;
            }

            method.apply(this, args);
          },
        },
        // Set log level - use 'debug' in development, 'info' in production
        level: process.env.NODE_ENV !== "production" ? "debug" : "info",
        // Redact sensitive data.
        // See https://getpino.io/#/docs/redaction
        redact: ["req.headers", "res.headers"],
        transport: buildPinoTransport(),
      },
    }),
  ],
})
export class ResyncGameFrameworkLoggerModule {}
