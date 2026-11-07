// biome-ignore lint/style/useNodejsImportProtocol: Use Node.js import protocol
const path = require("path");

const PUBLIC_URL = (() => {
  if (process.env.NODE_ENV !== "development") {
    return "";
  }

  const { PUBLIC_URL } = require("./publicUrl");
  return PUBLIC_URL;
})();

// `resync dev --network` serves the dev server from an ngrok hostname. Next blocks
// cross-origin requests to dev resources (including the `/_next` HMR websocket)
// unless that hostname is allowlisted, and a blocked socket leaves the page
// unhydrated. Wildcards cover every per-developer tunnel, not only the
// FRONTEND_URL that happened to be set when this file was loaded.
const TUNNEL_DEV_ORIGINS = [
  "*.ngrok.app",
  "*.ngrok-free.app",
  "*.ngrok-free.dev",
];

const frontendTunnelHost = (() => {
  if (process.env.NODE_ENV !== "development" || !process.env.FRONTEND_URL) {
    return undefined;
  }

  try {
    return new URL(process.env.FRONTEND_URL).hostname;
  } catch {
    return undefined;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: [
    PUBLIC_URL,
    ...TUNNEL_DEV_ORIGINS,
    ...(frontendTunnelHost ? [frontendTunnelHost] : []),
  ].filter(Boolean),
  devIndicators: false,
  experimental: {
    cpus: 1,
  },
  async headers() {
    return [
      {
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
        source: "/public/doc/:slug",
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        hostname: "localhost",
        pathname: "/visual/**",
        port: "8080",
        protocol: "http",
      },
    ],
  },
  reactStrictMode: false,
  sassOptions: {
    includePaths: [path.join(__dirname, "styles")],
  },
};

nextConfig.env = {
  ...nextConfig.env,
  APP_BASE_URL: process.env.APP_BASE_URL,
  PUBLIC_URL: process.env.PUBLIC_URL,
};

if (process.env.NODE_ENV === "development") {
  // Allow Node.js to accept self-signed SSL certs when making server-side
  // fetch calls (e.g. SSR → local backend on https://localhost:8080).
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  // Keep APP_BASE_URL aligned with the browser origin. `resync dev` writes
  // FRONTEND_URL into .env before boot — https://localhost:3000 normally, or
  // the ngrok tunnel under `--network`.
  nextConfig.env = {
    ...nextConfig.env,
    APP_BASE_URL:
      process.env.FRONTEND_URL ||
      `https://${process.env.PUBLIC_URL || "localhost"}:3000`,
    NEXT_PUBLIC_API_CLIENT_URL: process.env.BACKEND_API_URL,
  };
} else {
  nextConfig.env = {
    ...nextConfig.env,
    // The URL to the backend server
    NEXT_PUBLIC_API_CLIENT_URL: process.env.PUBLIC_URL,
  };
}

module.exports = nextConfig;
