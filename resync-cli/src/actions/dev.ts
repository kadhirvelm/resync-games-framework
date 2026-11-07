import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATABASE_HOST_URL } from "../constants/database";
import { checkRedisConnection } from "../utils/checkRedisConnection";
import { getRoot } from "../utils/getRoot";
import { logColorMessage } from "../utils/logColorMessage";
import {
  type NgrokSession,
  printNgrokUrls,
  startNgrok,
  stopNgrok,
} from "../utils/ngrok";
import { updatePublicUrl, updatePublicUrlJs } from "../utils/updatePublicUrl";
import { createTestDatabase, database } from "./database";
import { ensureEnvFileInSync } from "./ensureEnvInSync";
import { loadEnvironment } from "./loadEnvironment";
import { open } from "./open";

function isCertificateExpired(certPath: string): boolean {
  try {
    // Use openssl to check certificate expiration
    const result = execSync(`openssl x509 -enddate -noout -in "${certPath}"`, {
      encoding: "utf-8",
    });
    // Output format: "notAfter=Mon Jan  1 00:00:00 2025 GMT"
    const match = result.match(/notAfter=(.+)/);
    if (!match) return true;

    const expirationDate = new Date(match[1]);
    const now = new Date();

    // Consider expired if less than 30 days remaining for buffer
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return expirationDate.getTime() - now.getTime() < thirtyDaysMs;
  } catch {
    // If we can't check, assume expired to be safe
    return true;
  }
}

/**
 * Older `--network` runs minted certificates for the machine's LAN IP only;
 * those don't cover `localhost`, which is all the stack binds to now. ngrok
 * forwards to `https://localhost`.
 */
function certificateCoversLocalhost(certPath: string): boolean {
  try {
    const result = execSync(
      `openssl x509 -noout -ext subjectAltName -in "${certPath}"`,
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return result.includes("DNS:localhost");
  } catch {
    return false;
  }
}

function generateCertificates(keyPath: string, certPath: string) {
  try {
    execSync(
      `mkcert -key-file "${keyPath}" -cert-file "${certPath}" localhost 127.0.0.1 ::1`,
      { stdio: "inherit" },
    );
    logColorMessage("HTTPS certificates generated successfully.", "green");
  } catch {
    logColorMessage(
      "Failed to generate certificates. Make sure mkcert is installed and run 'mkcert -install' first.",
      "red",
    );
    process.exit(1);
  }
}

function ensureMkcertInstalled() {
  try {
    execSync("which mkcert", { stdio: "ignore" });
  } catch {
    logColorMessage(
      "mkcert is not installed. Please run the bootstrap script first: ./scripts/bootstrap.sh",
      "red",
    );
    process.exit(1);
  }
}

function ensureCertificates() {
  const root = getRoot();
  const certsDir = join(root, ".certs");
  const certPath = join(certsDir, "localhost.pem");
  const keyPath = join(certsDir, "localhost-key.pem");

  const certsExist = existsSync(certPath) && existsSync(keyPath);

  if (
    certsExist &&
    !isCertificateExpired(certPath) &&
    certificateCoversLocalhost(certPath)
  ) {
    return;
  }

  if (certsExist) {
    logColorMessage(
      "HTTPS certificates are missing localhost or expiring soon. Regenerating...",
      "yellow",
    );
  } else {
    logColorMessage("Setting up HTTPS certificates...", "yellow");
  }

  ensureMkcertInstalled();

  // Create .certs directory if it doesn't exist
  if (!existsSync(certsDir)) {
    mkdirSync(certsDir, { recursive: true });
  }

  generateCertificates(keyPath, certPath);
}

function openDocker() {
  logColorMessage("Opening Docker", "yellow");

  // On recent macOS/Docker Desktop releases, Docker Desktop CLI helpers may not be present or may behave differently.
  // We'll check for Docker and, if it's not running, instruct the user to open Docker Desktop themselves.
  try {
    execSync("docker info > /dev/null 2>&1");
    // Docker is running
  } catch (_e) {
    logColorMessage("Docker is not running.", "red");
    if (process.platform === "darwin") {
      logColorMessage(
        "Please open Docker Desktop manually (open /Applications/Docker.app). The CLI can no longer reliably open it automatically. The dev setup will resume once Docker is running.",
        "yellow",
      );
    }

    // Wait for docker to become ready
    let ready = false;
    const startWait = Date.now();
    while (!ready && Date.now() - startWait < 3 * 60 * 1000) {
      // max 3 min
      try {
        execSync("docker info > /dev/null 2>&1");
        ready = true;
      } catch {
        // Wait and retry
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000); // sleep 1s
      }
    }

    if (!ready) {
      logColorMessage("Docker did not start within 3 minutes. Exiting.", "red");
      process.exit(1);
    }

    logColorMessage("Docker is now running", "green");
  }

  logColorMessage("Docker running", "yellow");
}

function resetDocker() {
  execSync("docker-compose -f docker-compose.yml down -v --remove-orphans");
  logColorMessage("Docker environment reset", "red");
}

function turnOnDocker() {
  execSync("docker-compose -f docker-compose.yml up -d");
  logColorMessage("Docker environment turned on", "yellow");
}

function runMigrations(forEndToEnd?: boolean) {
  const root = getRoot();
  execSync("bun run db:migrate", {
    cwd: `${root}/packages/database`,
    env: {
      ...process.env,
      ...(forEndToEnd ? { DATABASE_HOST_URL } : {}),
    },
    stdio: "inherit",
  });
  logColorMessage("Database migrations completed.", "yellow");
}

function runDev(forEndToEnd?: boolean): ChildProcess {
  if (forEndToEnd) {
    return spawn("bun", ["run", "turbo", "run", "dev"], {
      cwd: getRoot(),
      env: {
        ...process.env,
        DATABASE_HOST_URL,
      },
      stdio: "inherit",
    });
  }

  return spawn("bun", ["run", "turbo", "run", "dev", "--ui=tui"], {
    cwd: getRoot(),
    env: {
      ...process.env,
    },
    stdio: "inherit",
  });
}

export async function dev(
  network?: boolean,
  reset?: boolean,
  forEndToEnd?: boolean,
) {
  // Ensure HTTPS certificates exist. The stack always binds to localhost;
  // `--network` publishes that localhost listener through ngrok.
  ensureCertificates();

  // Start Docker containers required for development
  openDocker();

  // If reset flag is true, reset Docker containers; otherwise, just ensure they're running
  if (reset) {
    resetDocker();
  } else {
    turnOnDocker();
  }

  // Ensure the .env file is in sync with default environment values -> this is where we add new environment variables to the .env file
  const environmentFile = ensureEnvFileInSync();

  // Tunnels must exist before the stack boots: Next.js and Nest read the
  // public URLs from the environment at startup. The processes themselves
  // still bind to localhost.
  let ngrokSession: NgrokSession | undefined;
  if (network && !forEndToEnd) {
    try {
      ngrokSession = await startNgrok(environmentFile);
    } catch (error) {
      logColorMessage(
        `Failed to start ngrok: ${error instanceof Error ? error.message : String(error)}`,
        "red",
      );
      process.exit(1);
    }
    // Any `process.exit` between here and shutdown (failed migration, Redis
    // down, ...) must still take the tunnels with it.
    const session = ngrokSession;
    process.on("exit", () => {
      if (
        session.child.exitCode === null &&
        session.child.signalCode === null
      ) {
        session.child.kill("SIGKILL");
      }
    });
    printNgrokUrls(ngrokSession.urls);
  }

  const ipAddress = "localhost";

  // Update the URL entries in the .env file (localhost or ngrok tunnels)
  updatePublicUrl(ipAddress, environmentFile, ngrokSession?.urls);

  // Update the PUBLIC_URL in the JavaScript config file
  updatePublicUrlJs(ipAddress);

  // Load environment variables from the .env file into process.env
  loadEnvironment();

  if (
    process.env.PUBLIC_URL === "" ||
    process.env.PUBLIC_URL == null ||
    process.env.PUBLIC_URL !== ipAddress
  ) {
    // If the PUBLIC_URL is not set correctly, log an error and return, for safety
    logColorMessage(
      "PUBLIC_URL is not set correctly. Please restart the dev command.",
      "red",
    );
    stopNgrok(ngrokSession);
    process.exit(1);
  }

  // Ensure Redis is ready before proceeding
  await checkRedisConnection(
    process.env.REDIS_HOST || "localhost",
    Number.parseInt(process.env.REDIS_PORT || "6379", 10),
  );

  // Make sure the database client is up to date
  database(["build"]);

  // Create test database if running e2e tests
  if (forEndToEnd) {
    await createTestDatabase();
  }

  // Run migrations - this will load the environment variables through ./database.ts
  runMigrations(forEndToEnd);

  // Run open and runDev in separate threads
  if (!forEndToEnd) {
    open(ngrokSession?.urls);
  }

  const devChild = runDev(forEndToEnd);
  if (!ngrokSession) return;

  const session = ngrokSession;
  let ngrokStopRequested = false;
  // Swallowing SIGINT keeps this process alive long enough to tear the
  // tunnels down after turbo exits. The terminal still delivers the signal
  // to the dev process group, so turbo shuts down on its own.
  const markNgrokStopRequested = () => {
    ngrokStopRequested = true;
  };
  process.on("SIGINT", markNgrokStopRequested);
  process.on("SIGTERM", markNgrokStopRequested);

  session.child.on("exit", (code, signal) => {
    if (ngrokStopRequested) return;
    logColorMessage(
      `ngrok exited unexpectedly (${signal ?? code}); the public URLs are no longer reachable. Restart \`resync dev --network\` to re-establish them.`,
      "red",
    );
  });

  devChild.on("exit", (code) => {
    ngrokStopRequested = true;
    stopNgrok(session);
    process.exit(code ?? 0);
  });
}
