import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  RETRYABLE_STATUS_CODES,
  TelemetryClient,
  getRetryDelay,
  sleep,
  uuid,
  type Identity,
  type Transport
} from "./core.js";
import type { ClientConfig } from "./types.js";

const CONFIG_DIR = ".webiny";
const CONFIG_FILE = "config";
const OPT_OUT_ENV = "WEBINY_TELEMETRY";

export interface NodeClientConfig extends ClientConfig {
  /** Override the path to the Webiny config file. Defaults to ~/.webiny/config. */
  configPath?: string;
  /**
   * Force a specific distinct_id instead of reading/minting the machine id in
   * the Webiny config file. When provided, it's used as-is and the config file
   * is left untouched. Webiny passes the canonical `@webiny/global-config` id
   * here so CLI, admin, and website events share one identity; without it the
   * client falls back to its own `user.id` field, which is a different UUID.
   */
  distinctId?: string;
  /** Number of retry attempts for transient HTTP errors. Defaults to 3. */
  retries?: number;
  /** Base delay in ms between retries (exponential backoff). Defaults to 200. */
  retryDelay?: number;
}

class NodeIdentity implements Identity {
  private path: string;
  private cached: string | null = null;
  private fixedId: string | null;

  constructor(configPath?: string, fixedId?: string) {
    this.path = configPath ?? join(homedir(), CONFIG_DIR, CONFIG_FILE);
    this.fixedId = fixedId ?? null;
  }

  getDistinctId(): string | null {
    if (this.fixedId) {
      return this.fixedId;
    }
    if (this.cached) {
      return this.cached;
    }

    const config = this.readConfig();
    const existingId = (config?.user as { id?: string } | undefined)?.id;
    if (existingId) {
      this.cached = existingId;
      return existingId;
    }

    const id = uuid();
    this.writeConfig({
      ...config,
      user: { ...((config?.user as object) ?? {}), id }
    });
    this.cached = id;
    return id;
  }

  isOptedOut(): boolean {
    return process.env[OPT_OUT_ENV] === "false";
  }

  private readConfig(): Record<string, unknown> | null {
    if (!existsSync(this.path)) {
      return null;
    }
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
  private retries: number;
  private retryDelay: number;

  constructor(retries: number, retryDelay: number) {
    this.retries = retries;
    this.retryDelay = retryDelay;
  }

  async send(url: string, body: string): Promise<void> {
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          body,
          headers: { "Content-Type": "text/plain;charset=UTF-8" }
        });

        if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status)) {
          return;
        }

        if (attempt < this.retries) {
          await sleep(getRetryDelay(response, attempt, this.retryDelay));
        }
      } catch (err) {
        if (attempt >= this.retries) {
          throw err;
        }
        await sleep(this.retryDelay * 2 ** attempt);
      }
    }
  }
}

export class WTS extends TelemetryClient {
  constructor(config: NodeClientConfig) {
    super(
      config,
      new NodeIdentity(config.configPath, config.distinctId),
      new NodeTransport(config.retries ?? 3, config.retryDelay ?? 200)
    );
  }
}
