import { exec } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sleep } from "bun";
import { getRoot } from "../utils/getRoot";
import { logColorMessage } from "../utils/logColorMessage";
import { type NgrokUrls, printNgrokUrls } from "../utils/ngrok";

const LOCAL_FRONTEND_URL = "https://localhost:3000";

/**
 * URL the browser should open. Live tunnel URLs win; otherwise `FRONTEND_URL`
 * from the root `.env` (what `resync dev --network` wrote); otherwise localhost.
 *
 * @param ngrokUrls - Tunnels from the current `resync dev --network` process.
 * @param configuredFrontendUrl - `FRONTEND_URL` already stored in `.env`.
 * @returns Absolute URL to pass to the OS opener.
 */
export function urlToOpen(
  ngrokUrls?: NgrokUrls,
  configuredFrontendUrl?: string,
): string {
  if (ngrokUrls?.frontend) return ngrokUrls.frontend;

  const configured = configuredFrontendUrl?.trim();
  if (configured) return configured;

  return LOCAL_FRONTEND_URL;
}

/**
 * Reads `FRONTEND_URL` from the repo-root `.env` without mutating `process.env`.
 *
 * @returns The configured frontend URL, or `undefined` when it isn't set.
 */
function readConfiguredFrontendUrl(): string | undefined {
  const envPath = join(getRoot(), ".env");
  if (!existsSync(envPath)) return undefined;

  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith("FRONTEND_URL="));
  if (line === undefined) return undefined;

  const value = line.slice("FRONTEND_URL=".length).trim();
  if (value === "") return undefined;
  return value;
}

async function checkFrontend(url: string) {
  return new Promise((resolve) => {
    const child = exec(`curl -sk "${url}" > /dev/null`, (error) => {
      if (resolved) return;
      clearTimeout(timeout);

      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }

      resolved = true;
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (resolved) return;
      child.kill?.();
      resolve(false);
      resolved = true;
    }, 500);
  });
}

/**
 * Waits for the local frontend to accept connections, then opens it in the
 * default browser. With ngrok URLs, readiness is still checked against
 * localhost (the tunnel edge answers before the app is up) but the public URL
 * is what gets opened and re-printed for sharing. `resync open` on its own reads
 * `FRONTEND_URL` from `.env`, which `resync dev --network` points at the tunnel.
 *
 * These are exec instead of execSync because we don't want to block the main thread.
 */
export async function open(ngrokUrls?: NgrokUrls) {
  while (!(await checkFrontend(LOCAL_FRONTEND_URL))) {
    sleep(500);
  }

  const url = urlToOpen(ngrokUrls, readConfiguredFrontendUrl());
  if (ngrokUrls) {
    printNgrokUrls(ngrokUrls);
  }
  logColorMessage(`Opening ${url}`, "green");

  exec(
    `
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open "${url}"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        xdg-open "${url}"
    else
        echo "Unsupported OS for automatic browser opening"
    fi
    `,
  );
}
