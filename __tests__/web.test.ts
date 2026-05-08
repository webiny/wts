import { test } from "node:test";
import assert from "node:assert/strict";

// Set up DOM-ish globals before importing the web entrypoint.
const cookieJar: { value: string } = { value: "" };
const storage = new Map<string, string>();

function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

defineGlobal("window", globalThis);
defineGlobal("navigator", { sendBeacon: undefined });
defineGlobal("location", {
  hostname: "www.webiny.com",
  href: "https://www.webiny.com/get-started",
  protocol: "https:",
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
  referrer: "https://www.google.com/",
});
defineGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

let capturedRequest: { url: string; init: RequestInit } | null = null;
(globalThis as any).fetch = async (url: string, init: RequestInit) => {
  capturedRequest = { url, init };
  return new Response(null, { status: 200 });
};

const { WTS } = await import("../src/web.ts");

test("WTS web client mints a UUID and writes it to cookie + localStorage", () => {
  cookieJar.value = "";
  storage.clear();
  capturedRequest = null;

  const wts = new WTS({ source: "site", apiUrl: "https://t.example.com" });
  wts.track("test-event", { foo: "bar" });

  assert.ok(cookieJar.value.includes("wts_did="), "cookie wts_did is set");
  assert.ok(storage.has("wts_did"), "localStorage wts_did is set");
});

test("WTS web client posts JSON body to /event with text/plain content-type", async () => {
  cookieJar.value = "";
  storage.clear();
  capturedRequest = null;

  const wts = new WTS({ source: "site", apiUrl: "https://t.example.com" });
  wts.track("test-event", { foo: "bar" });

  // Allow the async send to fire
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(capturedRequest, "fetch was called");
  assert.equal(capturedRequest!.url, "https://t.example.com/event");
  assert.equal(capturedRequest!.init.method, "POST");
  const headers = capturedRequest!.init.headers as Record<string, string>;
  assert.match(headers["Content-Type"]!, /text\/plain/);

  const body = JSON.parse(capturedRequest!.init.body as string);
  assert.equal(body.event, "test-event");
  assert.equal(body.source, "site");
  assert.equal(body.properties.foo, "bar");
  assert.ok(body.distinct_id, "distinct_id is set");
  assert.ok(body.timestamp, "timestamp is set");
});

test("WTS web client honors WEBINY_TELEMETRY=false in localStorage", async () => {
  cookieJar.value = "";
  storage.clear();
  storage.set("WEBINY_TELEMETRY", "false");
  capturedRequest = null;

  const wts = new WTS({ source: "site" });
  wts.track("test-event");

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(capturedRequest, null, "no event sent when opted out");
});

test("WTS web client uses fixed distinctId when provided", async () => {
  cookieJar.value = "";
  storage.clear();
  capturedRequest = null;

  const wts = new WTS({ source: "admin", distinctId: "machine-abc-123" });
  wts.track("admin-app-start");

  await new Promise((r) => setTimeout(r, 10));
  const body = JSON.parse(capturedRequest!.init.body as string);
  assert.equal(body.distinct_id, "machine-abc-123");
  assert.equal(body.source, "admin");
});

test("WTS.alias posts a $create_alias event", async () => {
  cookieJar.value = "";
  storage.clear();
  capturedRequest = null;

  const wts = new WTS({ source: "site" });
  wts.alias("old-id", "new-id");

  await new Promise((r) => setTimeout(r, 10));
  const body = JSON.parse(capturedRequest!.init.body as string);
  assert.equal(body.event, "$create_alias");
  assert.equal(body.alias, "old-id");
  assert.equal(body.distinct_id, "new-id");
});

test("WTS.alias rejects equal or empty ids", async () => {
  cookieJar.value = "";
  storage.clear();
  capturedRequest = null;

  const wts = new WTS({ source: "site" });
  wts.alias("same", "same");
  wts.alias("", "x");
  wts.alias("y", "");

  await new Promise((r) => setTimeout(r, 10));
  assert.equal(capturedRequest, null, "no alias event sent for invalid ids");
});

test("WTS.getCookieId reads the cookie jar", () => {
  cookieJar.value = "";
  storage.clear();

  const wts = new WTS({ source: "site" });
  const expected = wts["identity"].getDistinctId();
  const fromCookie = WTS.getCookieId();
  assert.equal(fromCookie, expected);
});
