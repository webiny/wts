import { test, expect, beforeEach, vi } from "vitest";
import { WTS } from "../src/web.js";

// Set up DOM-ish globals before importing the web entrypoint.
const cookieJar: { value: string } = { value: "" };
const storage = new Map<string, string>();

function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    value,
    writable: true,
    configurable: true
  });
}

defineGlobal("window", globalThis);
defineGlobal("navigator", { sendBeacon: undefined });
defineGlobal("location", {
  hostname: "www.webiny.com",
  href: "https://www.webiny.com/get-started",
  protocol: "https:"
});
defineGlobal("document", {
  get cookie() {
    return cookieJar.value;
  },
  set cookie(v: string) {
    const [pair] = v.split(";");
    if (pair && pair.includes("=")) {
      cookieJar.value = cookieJar.value ? `${cookieJar.value}; ${pair.trim()}` : pair.trim();
    }
  },
  referrer: "https://www.google.com/"
});
defineGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k)
});

interface ICapturedRequest {
  url: string;
  init: RequestInit;
}

let capturedRequest: ICapturedRequest | null = null;
(globalThis as any).fetch = async (url: string, init: RequestInit) => {
  capturedRequest = { url, init };
  return new Response(null, { status: 200 });
};

beforeEach(() => {
  cookieJar.value = "";
  storage.clear();
  capturedRequest = null;
});

test("WTS web client mints a UUID and writes it to cookie + localStorage", () => {
  const wts = new WTS({ source: "site", apiUrl: "https://t.example.com" });
  wts.track("test-event", { foo: "bar" });

  expect(cookieJar.value).toContain("wts_did=");
  expect(storage.has("wts_did")).toBe(true);
});

test("WTS web client posts JSON body to /event with text/plain content-type", async () => {
  const wts = new WTS({ source: "site", apiUrl: "https://t.example.com" });
  wts.track("test-event", { foo: "bar" });

  await new Promise(r => setTimeout(r, 10));

  expect(capturedRequest).not.toBeNull();
  expect(capturedRequest!.url).toBe("https://t.example.com/event");
  expect(capturedRequest!.init.method).toBe("POST");
  const headers = capturedRequest!.init.headers as Record<string, string>;
  expect(headers["Content-Type"]).toMatch(/text\/plain/);

  const body = JSON.parse(capturedRequest!.init.body as string);
  expect(body.event).toBe("test-event");
  expect(body.source).toBe("site");
  expect(body.properties.foo).toBe("bar");
  expect(body.distinct_id).toBeTruthy();
  expect(body.timestamp).toBeTruthy();
});

test("WTS web client honors WEBINY_TELEMETRY=false in localStorage", async () => {
  storage.set("WEBINY_TELEMETRY", "false");

  const wts = new WTS({ source: "site" });
  wts.track("test-event");

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequest).toBeNull();
});

test("WTS web client uses fixed distinctId when provided", async () => {
  const wts = new WTS({ source: "admin", distinctId: "machine-abc-123" });
  wts.track("admin-app-start");

  await new Promise(r => setTimeout(r, 10));
  const body = JSON.parse(capturedRequest!.init.body as string);
  expect(body.distinct_id).toBe("machine-abc-123");
  expect(body.source).toBe("admin");
});

test("WTS.alias posts a $create_alias event", async () => {
  const wts = new WTS({ source: "site" });
  wts.alias("old-id", "new-id");

  await new Promise(r => setTimeout(r, 10));
  const body = JSON.parse(capturedRequest!.init.body as string);
  expect(body.event).toBe("$create_alias");
  expect(body.alias).toBe("old-id");
  expect(body.distinct_id).toBe("new-id");
});

test("WTS.alias rejects equal or empty ids", async () => {
  const wts = new WTS({ source: "site" });
  wts.alias("same", "same");
  wts.alias("", "x");
  wts.alias("y", "");

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequest).toBeNull();
});

test("WTS.getCookieId reads the cookie jar", () => {
  const wts = new WTS({ source: "site" });
  const expected = wts["identity"].getDistinctId();
  const fromCookie = WTS.getCookieId();
  expect(fromCookie).toBe(expected);
});

test("WTS web client trackPageView sends page-view event with url and referrer", async () => {
  const wts = new WTS({ source: "site", apiUrl: "https://t.example.com" });
  wts.trackPageView({ custom: "prop" });

  await new Promise(r => setTimeout(r, 10));

  expect(capturedRequest).not.toBeNull();
  const body = JSON.parse(capturedRequest!.init.body as string);
  expect(body.event).toBe("page-view");
  expect(body.url).toBe("https://www.webiny.com/get-started");
  expect(body.referrer).toBe("https://www.google.com/");
  expect(body.properties.custom).toBe("prop");
});

test("WTS web client recovers id from localStorage when cookie is missing", () => {
  storage.set("wts_did", "stored-id-123");

  const wts = new WTS({ source: "site" });
  wts.track("test-event");

  expect(cookieJar.value).toContain("stored-id-123");
});

test("WTS web client sends debug output when enabled", async () => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});

  const wts = new WTS({ source: "site", debug: true });
  wts.track("debug-test");

  await new Promise(r => setTimeout(r, 10));
  expect(spy).toHaveBeenCalledWith(
    "[wts]",
    "dispatch",
    expect.objectContaining({ event: "debug-test" })
  );

  spy.mockRestore();
});

test("WTS web client logs send failure in debug mode", async () => {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});

  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async () => {
    throw new Error("network down");
  };

  const wts = new WTS({ source: "site", debug: true });
  wts.track("fail-test");

  await new Promise(r => setTimeout(r, 50));
  expect(spy).toHaveBeenCalledWith("[wts]", "send failed", expect.any(Error));

  spy.mockRestore();
  (globalThis as any).fetch = originalFetch;
});

test("WTS web client skips alias when opted out", async () => {
  storage.set("WEBINY_TELEMETRY", "false");

  const wts = new WTS({ source: "site" });
  wts.alias("old", "new");

  await new Promise(r => setTimeout(r, 10));
  expect(capturedRequest).toBeNull();
});
