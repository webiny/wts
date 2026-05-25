import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  TelemetryClient,
  uuid,
  type Identity,
  type Transport,
} from "./core.js";
import type { ClientConfig } from "./types.js";

const CONFIG_DIR = ".webiny";
const CONFIG_FILE = "config";
const OPT_OUT_ENV = "WEBINY_TELEMETRY";

export interface NodeClientConfig extends ClientConfig {
  /** Override the path to the Webiny config file. Defaults to ~/.webiny/config. */
  configPath?: string;
}

class NodeIdentity implements Identity {
  private path: string;
  private cached: string | null = null;

  constructor(configPath?: string) {
    this.path = configPath ?? join(homedir(), CONFIG_DIR, CONFIG_FILE);
  }

  getDistinctId(): string | null {
    if (this.cached) return this.cached;

    const config = this.readConfig();
    const existingId = (config?.user as { id?: string } | undefined)?.id;
    if (existingId) {
      this.cached = existingId;
      return existingId;
    }

    const id = uuid();
    this.writeConfig({
      ...config,
      user: { ...((config?.user as object) ?? {}), id },
    });
    this.cached = id;
    return id;
  }

  isOptedOut(): boolean {
    return process.env[OPT_OUT_ENV] === "false";
  }

  private readConfig(): Record<string, unknown> | null {
    if (!existsSync(this.path)) return null;
    try {
      const raw = readFileSync(this.path, "utf8");
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeConfig(config: Record<string, unknown>): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(config, null, 2));
    } catch {
      // Filesystem unavailable; identity becomes ephemeral for this process.
    }
  }
}

class NodeTransport implements Transport {
  async send(url: string, body: string): Promise<void> {
    await fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
  }
}

export class WTS extends TelemetryClient {
  constructor(config: NodeClientConfig) {
    super(config, new NodeIdentity(config.configPath), new NodeTransport());
  }
}
