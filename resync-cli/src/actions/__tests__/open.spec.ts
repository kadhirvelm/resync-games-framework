import { describe, expect, test } from "bun:test";
import { urlToOpen } from "../open";

const ngrokUrls = {
  backend: "https://ada-api.dev.example.com",
  frontend: "https://ada-frontend.dev.example.com",
};

describe("urlToOpen", () => {
  test("opens the live ngrok frontend when tunnels are running", () => {
    expect(urlToOpen(ngrokUrls, "https://localhost:3000")).toBe(
      "https://ada-frontend.dev.example.com",
    );
  });

  test("opens FRONTEND_URL from .env when resync open is run on its own", () => {
    expect(urlToOpen(undefined, "https://snowman.ngrok-free.dev")).toBe(
      "https://snowman.ngrok-free.dev",
    );
  });

  test("opens localhost when no public frontend URL is configured", () => {
    expect(urlToOpen(undefined, "   ")).toBe("https://localhost:3000");
    expect(urlToOpen()).toBe("https://localhost:3000");
  });
});
