import * as fs from "node:fs";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ExpressAdapter } from "@nestjs/platform-express";
import compression from "compression";
import dotenv from "dotenv";
import express, { json, urlencoded } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { RedisIoAdapter } from "src/infra/redis/redis.adapter";
import { AppModule } from "../app.module";
import { RedisService } from "../infra/redis/redis.service";
import { AllExceptionsFilter } from "../library/AllExceptions.filter";
import {
  getPublicAssetsRootPath,
  PUBLIC_ASSETS_URL_PREFIX,
} from "../library/publicAssetsRoot";

// Load development environment variables before the app boots.
// In production, env vars are injected by the deployment environment directly.
if (process.env.NODE_ENV === "development") {
  dotenv.config({ path: ".env.development" });
}

async function bootstrap() {
  const backendPort = Number(process.env.BACKEND_PORT ?? "8080");
  if (
    !Number.isInteger(backendPort) ||
    backendPort < 1 ||
    backendPort > 65535
  ) {
    throw new Error("BACKEND_PORT must be an integer from 1 to 65535.");
  }
  const finalPublicUrl = process.env.PUBLIC_URL ?? "0.0.0.0";
  // biome-ignore lint/suspicious/noConsole: Need to indicate to the user that the server is starting
  console.log(`Starting server on ${finalPublicUrl}:${backendPort}`);

  // HTTPS options for local development — production terminates TLS at the load balancer.
  const httpsOptions =
    process.env.NODE_ENV === "development"
      ? {
          cert: fs.readFileSync("../../.certs/localhost.pem"),
          key: fs.readFileSync("../../.certs/localhost-key.pem"),
        }
      : undefined;

  /**
   * `express.static` must be registered on the Express app **before** `NestFactory.create`
   * (via `new ExpressAdapter(expressInstance)`). If static is `use`d only after the Nest
   * app is built, `/static/...` is often handled by the Nest 404 / router first, the
   * `serve-static` `setHeaders` (including CORS) never run, and browsers see a response
   * with no `Access-Control-Allow-Origin` for Phaser/Next.
   */
  const expressInstance = express();
  const staticSetHeaders = (
    res: { setHeader: (k: string, v: string) => void },
    filePath: string,
  ) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (filePath.endsWith(".webp")) {
      res.setHeader("Content-Type", "image/webp");
      return;
    }
    if (filePath.endsWith(".json")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
  };
  const staticMiddlewareOptions = {
    dotfiles: "deny" as const,
    immutable: true,
    maxAge: "1y" as const,
    setHeaders: (
      res: { setHeader: (k: string, v: string) => void },
      filePath: string,
    ) => {
      staticSetHeaders(res, filePath);
    },
  };
  // One mount for every asset class folder (card-characters, backgrounds, …).
  expressInstance.use(
    PUBLIC_ASSETS_URL_PREFIX,
    express.static(getPublicAssetsRootPath(), staticMiddlewareOptions),
  );

  // bufferLogs: true holds log output until app.useLogger() is called below,
  // so no early NestJS startup messages are lost or printed in the wrong format.
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressInstance),
    {
      // Disable NestJS's built-in body parsers so we can register our own with
      // a verify callback that captures the raw body bytes. This is required for
      // Slack HMAC-SHA256 signature verification, which must compare against the
      // exact bytes Slack sent — not a re-serialized JSON object.
      bodyParser: false,
      bufferLogs: true,
      cors: {
        credentials: true,
        origin: process.env.FRONTEND_URL,
      },
      httpsOptions,
    },
  );

  // Register SIGTERM/SIGINT listeners so the process shuts down gracefully.
  // Calls app.close() on signal, which triggers onModuleDestroy on all providers
  // (closing Prisma connections, Redis connections, etc.) before the process exits.
  app.enableShutdownHooks();

  // Convert all unhandled exceptions to a consistent ServiceError JSON shape.
  const allExceptions = app.get(AllExceptionsFilter);
  app.useGlobalFilters(allExceptions);

  // Route all NestJS logs through Pino. Must come after NestFactory.create()
  // because the Logger provider isn't available until the DI container is built.
  app.useLogger(app.get(Logger));

  // Increase body size limits above the Express default of 100kb to support
  app.use(
    [
      "/three-d-props/ingest",
      "/three-d-environments/ingest",
      "/three-d-characters/ingest",
    ],
    json({ limit: "28mb" }),
  );

  // Increase body size limits above the Express default of 100kb to support
  // large document payloads (blueprints, HTML content, base64 attachments).
  // The verify callback stores the raw request bytes on req.rawBody before
  // JSON parsing, so Slack HMAC signature verification can compare against
  // the exact bytes Slack signed rather than a re-serialized JSON object.
  app.use(
    json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: "2mb" }));

  // Compress HTTP responses to reduce bandwidth for large document payloads.
  app.use(compression());

  // Set security-related HTTP headers (CSP, Strict-Transport-Security, X-Frame-Options, etc).
  app.use(helmet());

  // Attach the Redis socket.io adapter BEFORE app.listen().
  // app.listen() calls init() internally, which is when NestJS injects
  // @WebSocketServer() into gateways. The adapter must be set by then so the
  // injected server uses the Redis adapter for cross-instance pub/sub.
  const redisService = app.get(RedisService);
  const redisAdapter = new RedisIoAdapter(app, redisService);
  await redisAdapter.connectToRedis();
  app.useWebSocketAdapter(redisAdapter);

  // Starts the HTTP server and triggers lifecycle hooks (onModuleInit,
  // onApplicationBootstrap), which initializes WebSocket gateways and BullMQ
  // queue producers.
  await app.listen(backendPort, finalPublicUrl);
}

bootstrap();
