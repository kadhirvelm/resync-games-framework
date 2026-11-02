import { describe, expect, test } from "bun:test";
import {
  findSharedHostname,
  renderV3EndpointConfig,
  tunnelsToStart,
} from "../ngrok";

describe("tunnelsToStart", () => {
  test("gives frontend and API their own resync-game-framework-*.ngrok.app hostnames by default", () => {
    const tunnels = tunnelsToStart({ NGROK_DEV_NAME: "ada" });

    expect(tunnels).toEqual([
      {
        domain: "resync-game-framework-ada-frontend.ngrok.app",
        name: "frontend",
        port: 3000,
      },
      {
        domain: "resync-game-framework-ada-api.ngrok.app",
        name: "backend",
        port: 8080,
      },
    ]);
  });

  test("derives a distinct per-developer hostname for each tunnel from NGROK_DOMAIN_SUFFIX", () => {
    const tunnels = tunnelsToStart({
      NGROK_DEV_NAME: "ada",
      NGROK_DOMAIN_SUFFIX: "dev.example.com",
    });

    expect(tunnels).toEqual([
      {
        domain: "ada-frontend.dev.example.com",
        name: "frontend",
        port: 3000,
      },
      { domain: "ada-api.dev.example.com", name: "backend", port: 8080 },
    ]);
  });

  test("lets NGROK_*_DOMAIN override a single tunnel's hostname", () => {
    const tunnels = tunnelsToStart({
      NGROK_BACKEND_DOMAIN: "api.example.dev",
      NGROK_DEV_NAME: "ada",
    });

    expect(tunnels[1]).toEqual({
      domain: "api.example.dev",
      name: "backend",
      port: 8080,
    });
    expect(tunnels[0]?.domain).toBe(
      "resync-game-framework-ada-frontend.ngrok.app",
    );
  });

  test("rejects hostnames that would put two tunnels on one hostname", () => {
    expect(() =>
      tunnelsToStart({
        NGROK_BACKEND_DOMAIN: "shared.example.dev",
        NGROK_FRONTEND_DOMAIN: "shared.example.dev",
      }),
    ).toThrow(/must be distinct/);
  });
});

describe("renderV3EndpointConfig", () => {
  test("pins each endpoint to its hostname and local upstream", () => {
    const yaml = renderV3EndpointConfig([
      {
        domain: "resync-game-framework-ada-api.ngrok.app",
        name: "backend",
        port: 8080,
      },
      {
        domain: "resync-game-framework-ada-frontend.ngrok.app",
        name: "frontend",
        port: 3000,
      },
    ]);

    expect(yaml).toContain(
      "url: https://resync-game-framework-ada-api.ngrok.app",
    );
    expect(yaml).toContain("url: https://localhost:8080");
    expect(yaml).toContain("url: https://localhost:3000");
    expect(yaml).not.toContain("url: https://\n");
  });
});

describe("findSharedHostname", () => {
  test("returns undefined when every tunnel has its own hostname", () => {
    expect(
      findSharedHostname({
        backend: "https://a-api.ngrok.app",
        frontend: "https://a-frontend.ngrok.app",
      }),
    ).toBeUndefined();
  });

  test("returns the hostname ngrok pooled more than one tunnel onto", () => {
    expect(
      findSharedHostname({
        backend: "https://snowman.ngrok-free.dev",
        frontend: "https://snowman.ngrok-free.dev",
      }),
    ).toBe("https://snowman.ngrok-free.dev");
  });
});
