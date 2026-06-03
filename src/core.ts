import type { AnyEvent, ClientConfig, EventProperties, EventSource } from "./types.js";

export const DEFAULT_API_URL = "https://t.webiny.com";

export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (e.g. older browsers, non-secure contexts).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface Transport {
  send(url: string, body: string): Promise<void>;
  sendBeacon?(url: string, body: string): boolean;
}

export const RETRYABLE_STATUS_CODES: Set<number> = new Set([408, 429, 500, 502, 503, 504]);

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRetryDelay(response: Response, attempt: number, baseDelay: number): number {
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds)) {
        return seconds * 1000;
      }
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) {
        return Math.max(0, date - Date.now());
      }
    }
  }
  return baseDelay * 2 ** attempt;
}

export interface Identity {
  getDistinctId(): string | null;
  isOptedOut(): boolean;
}

interface SendOptions {
  preferBeacon?: boolean;
}

export class TelemetryClient {
  protected source: EventSource;
  protected apiUrl: string;
  protected debugEnabled: boolean;
  protected identity: Identity;
  protected transport: Transport;

  constructor(config: ClientConfig, identity: Identity, transport: Transport) {
    this.source = config.source;
    this.apiUrl = config.apiUrl ?? DEFAULT_API_URL;
    this.debugEnabled = config.debug ?? false;
    this.identity = identity;
    this.transport = transport;
  }

  track(
    event: string,
    properties: EventProperties = {},
    context: { url?: string; referrer?: string } = {}
  ): void {
    if (this.identity.isOptedOut()) {
      this.debug("opted out, skipping track", event);
      return;
    }
    const distinctId = this.identity.getDistinctId();
    if (!distinctId) {
      this.debug("no distinct_id available, skipping track", event);
      return;
    }

    const payload: AnyEvent = {
      event,
      distinct_id: distinctId,
      source: this.source,
      properties,
      timestamp: new Date().toISOString(),
      ...(context.url ? { url: context.url } : {}),
      ...(context.referrer ? { referrer: context.referrer } : {})
    };

    this.dispatch(payload);
  }

  alias(oldId: string, newId: string): void {
    if (this.identity.isOptedOut()) {
      this.debug("opted out, skipping alias");
      return;
    }
    if (!oldId || !newId || oldId === newId) {
      this.debug("invalid alias ids", { oldId, newId });
      return;
    }

    const payload: AnyEvent = {
      event: "$create_alias",
      distinct_id: newId,
      alias: oldId,
      source: this.source,
      timestamp: new Date().toISOString()
    };

    this.dispatch(payload);
  }

  protected dispatch(payload: AnyEvent, options: SendOptions = {}): void {
    const url = `${this.apiUrl}/event`;
    const body = JSON.stringify(payload);

    this.debug("dispatch", payload);

    if (options.preferBeacon && this.transport.sendBeacon) {
      if (this.transport.sendBeacon(url, body)) {
        return;
      }
    }

    this.transport.send(url, body).catch(err => {
      this.debug("send failed", err);
    });
  }

  protected debug(...args: unknown[]): void {
    if (this.debugEnabled) {
      // eslint-disable-next-line no-console
      console.log("[wts]", ...args);
    }
  }
}
