import { test, expect, beforeAll, afterAll, beforeEach, vi, describe } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WTS } from "../src/node.js";

let tmpDir: string;
let configPath: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "wts-node-test-"));
  configPath = join(tmpDir, ".webiny", "config");
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

let capturedRequests: { url: string; init: RequestInit }[] = [];
let fetchBehavior: () => Response = () => new Response(null, { status: 200 });

(globalThis as any).fetch = async (url: string, init: RequestInit) => {
  capturedRequests.push({ url, init });
  return fetchBehavior();
};

beforeEach(() => {
  rmSync(configPath, { force: true });
  capturedRequests = [];
  fetchBehavior = () => new Response(null, { status: 200 });
});

test("WTS node client generates a machine id at the configured path", () => {
  const wts = new WTS({ source: "cli", configPath });
  wts.track("cli-test-event");

  expect(existsSync(configPath)).toBe(true);
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  expect(config.user?.id).toBeTruthy();
});

test("WTS node client preserves existing config fields when adding user.id", () => {
  mkdirSync(join(tmpDir, ".webiny"), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ telemetry: true, otherField: "preserved" }));

  const wts = new WTS({ source: "cli", configPath });
  wts.track("cli-test-event");

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  expect(config.telemetry).toBe(true);
  expect(config.otherField).toBe("preserved");
  expect(config.user?.id).toBeTruthy();
});

test("WTS node client reuses existing user.id from config", async () => {
  mkdirSync(join(tmpDir, ".webiny"), { recursive: true });
  const existingId = "00000000-0000-4000-8000-000000000001";
  writeFileSync(configPath, JSON.stringify({ user: { id: existingId } }));

  const wts = new WTS({
    source: "cli",
    configPath,
    apiUrl: "https://t.example.com"
  });
  wts.track("cli-test-event");

  await new Promise(r => setTimeout(r, 10));
  const body = JSON.parse(capturedRequests[0]!.init.body as string);
  expect(body.distinct_id).toBe(existingId);
});

test("WTS node client uses a provided distinctId as-is", async () => {
  const wts = new WTS({
    source: "cli",
    configPath,
    distinctId: "global-config-id-abc",
    apiUrl: "https://t.example.com"
  });
  wts.track("cli-create-webiny-project-start");

  await new Promise(r => setTimeout(r, 10));
  const body = JSON.parse(capturedRequests[0]!.init.body as string);
  expect(body.distinct_id).toBe("global-config-id-abc");
});

test("WTS node client leaves the config file untouched when distinctId is provided", async () => {
  const wts = new WTS({ source: "cli", configPath, distinctId: "global-config-id-abc" });
  wts.track("cli-create-webiny-project-start");

  await new Promise(r => setTimeout(r, 10));
  // No machine id should be minted into ~/.webiny/config when an id is injected.
  expect(existsSync(configPath)).toBe(false);
});

test("WTS node client prefers distinctId over an existing user.id in config", async () => {
  mkdirSync(join(tmpDir, ".webiny"), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ user: { id: "existing-user-id" } }));

  const wts = new WTS({
    source: "cli",
    configPath,
    distinctId: "global-config-id-abc",
    apiUrl: "https://t.example.com"
  });
  wts.track("cli-create-webiny-project-start");

  await new Promise(r => setTimeout(r, 10));
  const body = JSON.parse(capturedRequests[0]!.init.body as string);
  expect(body.distinct_id).toBe("global-config-id-abc");
});

test("WTS node client honors WEBINY_TELEMETRY=false env var", async () => {
  process.env.WEBINY_TELEMETRY = "false";

  const wts = new WTS({ source: "cli", configPath });
  wts.track("cli-test-event");

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequests).toHaveLength(0);

  delete process.env.WEBINY_TELEMETRY;
});

test("WTS node client posts JSON body to /event", async () => {
  const wts = new WTS({
    source: "cli",
    configPath,
    apiUrl: "https://t.example.com"
  });
  wts.track("cli-create-webiny-project-start", { os: "darwin" });

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequests).toHaveLength(1);
  expect(capturedRequests[0]!.url).toBe("https://t.example.com/event");
  const body = JSON.parse(capturedRequests[0]!.init.body as string);
  expect(body.event).toBe("cli-create-webiny-project-start");
  expect(body.source).toBe("cli");
  expect(body.properties.os).toBe("darwin");
});

test("WTS node client reads malformed config file gracefully", () => {
  mkdirSync(join(tmpDir, ".webiny"), { recursive: true });
  writeFileSync(configPath, "not valid json {{{");

  const wts = new WTS({ source: "cli", configPath });
  wts.track("cli-test-event");

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  expect(config.user?.id).toBeTruthy();
});

test("WTS node client uses debug mode when enabled", async () => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});

  const wts = new WTS({ source: "cli", configPath, debug: true });
  wts.track("cli-test-event");

  await new Promise(r => setTimeout(r, 10));
  expect(spy).toHaveBeenCalledWith(
    "[wts]",
    "dispatch",
    expect.objectContaining({ event: "cli-test-event" })
  );

  spy.mockRestore();
});

test("WTS node client skips alias when opted out", async () => {
  process.env.WEBINY_TELEMETRY = "false";

  const wts = new WTS({ source: "cli", configPath });
  wts.alias("old", "new");

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequests).toHaveLength(0);

  delete process.env.WEBINY_TELEMETRY;
});

describe("retry logic", () => {
  test("retries on 500 and succeeds", async () => {
    let callCount = 0;
    fetchBehavior = () => {
      callCount++;
      if (callCount <= 2) {
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: 200 });
    };

    const wts = new WTS({ source: "cli", configPath, retries: 3, retryDelay: 10 });
    wts.track("retry-test");

    await vi.waitFor(() => expect(capturedRequests.length).toBeGreaterThanOrEqual(3), {
      timeout: 1000
    });
    expect(capturedRequests).toHaveLength(3);
  });

  test("does not retry on 400", async () => {
    fetchBehavior = () => new Response(null, { status: 400 });

    const wts = new WTS({ source: "cli", configPath, retries: 3, retryDelay: 10 });
    wts.track("no-retry-test");

    await new Promise(r => setTimeout(r, 100));
    expect(capturedRequests).toHaveLength(1);
  });

  test("does not retry on 404", async () => {
    fetchBehavior = () => new Response(null, { status: 404 });

    const wts = new WTS({ source: "cli", configPath, retries: 3, retryDelay: 10 });
    wts.track("no-retry-test");

    await new Promise(r => setTimeout(r, 100));
    expect(capturedRequests).toHaveLength(1);
  });

  test("retries on network error", async () => {
    let callCount = 0;
    const originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url: string, init: RequestInit) => {
      capturedRequests.push({ url, init });
      callCount++;
      if (callCount <= 1) {
        throw new TypeError("fetch failed");
      }
      return new Response(null, { status: 200 });
    };

    const wts = new WTS({ source: "cli", configPath, retries: 3, retryDelay: 10 });
    wts.track("network-error-test");

    await vi.waitFor(() => expect(capturedRequests.length).toBeGreaterThanOrEqual(2), {
      timeout: 1000
    });
    expect(capturedRequests).toHaveLength(2);

    (globalThis as any).fetch = originalFetch;
  });

  test("respects Retry-After header on 429", async () => {
    let callCount = 0;
    fetchBehavior = () => {
      callCount++;
      if (callCount === 1) {
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": "0" }
        });
      }
      return new Response(null, { status: 200 });
    };

    const wts = new WTS({ source: "cli", configPath, retries: 3, retryDelay: 10 });
    wts.track("rate-limit-test");

    await vi.waitFor(() => expect(capturedRequests.length).toBeGreaterThanOrEqual(2), {
      timeout: 1000
    });
    expect(capturedRequests).toHaveLength(2);
  });

  test("exhausts all retries on persistent 503", async () => {
    fetchBehavior = () => new Response(null, { status: 503 });

    const wts = new WTS({ source: "cli", configPath, retries: 2, retryDelay: 10 });
    wts.track("exhausted-test");

    await new Promise(r => setTimeout(r, 200));
    expect(capturedRequests).toHaveLength(3);
  });
});
