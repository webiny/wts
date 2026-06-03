import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WTS } from "../src/node.ts";

let tmpDir: string;
let configPath: string;

before(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "wts-node-test-"));
  configPath = join(tmpDir, ".webiny", "config");
});

after(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

let capturedRequest: { url: string; init: RequestInit } | null = null;
(globalThis as any).fetch = async (url: string, init: RequestInit) => {
  capturedRequest = { url, init };
  return new Response(null, { status: 200 });
};

test("WTS node client generates a machine id at the configured path", () => {
  rmSync(configPath, { force: true });

  const wts = new WTS({ source: "cli", configPath });
  wts.track("cli-test-event");

  assert.ok(existsSync(configPath), "config file is written");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.ok(config.user?.id, "user.id is set in config");
});

test("WTS node client preserves existing config fields when adding user.id", () => {
  rmSync(configPath, { force: true });
  mkdirSync(join(tmpDir, ".webiny"), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ telemetry: true, otherField: "preserved" }));

  const wts = new WTS({ source: "cli", configPath });
  wts.track("cli-test-event");

  const config = JSON.parse(readFileSync(configPath, "utf8"));
  assert.equal(config.telemetry, true);
  assert.equal(config.otherField, "preserved");
  assert.ok(config.user?.id);
});

test("WTS node client reuses existing user.id from config", async () => {
  rmSync(configPath, { force: true });
  mkdirSync(join(tmpDir, ".webiny"), { recursive: true });
  const existingId = "00000000-0000-4000-8000-000000000001";
  writeFileSync(configPath, JSON.stringify({ user: { id: existingId } }));

  capturedRequest = null;
  const wts = new WTS({
    source: "cli",
    configPath,
    apiUrl: "https://t.example.com"
  });
  wts.track("cli-test-event");

  await new Promise(r => setTimeout(r, 10));
  const body = JSON.parse(capturedRequest!.init.body as string);
  assert.equal(body.distinct_id, existingId);
});

test("WTS node client honors WEBINY_TELEMETRY=false env var", async () => {
  rmSync(configPath, { force: true });
  process.env.WEBINY_TELEMETRY = "false";

  capturedRequest = null;
  const wts = new WTS({ source: "cli", configPath });
  wts.track("cli-test-event");

  await new Promise(r => setTimeout(r, 10));
  assert.equal(capturedRequest, null, "no event sent when opted out");

  delete process.env.WEBINY_TELEMETRY;
});

test("WTS node client posts JSON body to /event", async () => {
  rmSync(configPath, { force: true });
  capturedRequest = null;

  const wts = new WTS({
    source: "cli",
    configPath,
    apiUrl: "https://t.example.com"
  });
  wts.track("cli-create-webiny-project-start", { os: "darwin" });

  await new Promise(r => setTimeout(r, 10));
  assert.ok(capturedRequest);
  assert.equal(capturedRequest!.url, "https://t.example.com/event");
  const body = JSON.parse(capturedRequest!.init.body as string);
  assert.equal(body.event, "cli-create-webiny-project-start");
  assert.equal(body.source, "cli");
  assert.equal(body.properties.os, "darwin");
});
