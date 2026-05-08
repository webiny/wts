import { TelemetryClient, uuid, type Identity, type Transport } from "./core.js";
import type { ClientConfig } from "./types.js";

const COOKIE_NAME = "wts_did";
const STORAGE_KEY = "wts_did";
const OPT_OUT_KEY = "WEBINY_TELEMETRY";
const COOKIE_DAYS = 90;

export interface WebClientConfig extends ClientConfig {
  cookieDomain?: string;
  /**
   * Force a specific distinct_id (e.g. when running on CloudFront and reading
   * an id passed via URL params). When provided, this id is used as-is and is
   * persisted to localStorage so it survives page refreshes within the app.
   */
  distinctId?: string;
}

class BrowserIdentity implements Identity {
  private cookieDomain: string | null;
  private fixedId: string | null;

  constructor(cookieDomain?: string, fixedId?: string) {
    this.cookieDomain = cookieDomain ?? deriveApexDomain();
    this.fixedId = fixedId ?? null;
  }

  getDistinctId(): string | null {
    if (typeof document === "undefined") return null;

    if (this.fixedId) {
      this.persistToStorage(this.fixedId);
      return this.fixedId;
    }

    const fromCookie = readCookie(COOKIE_NAME);
    if (fromCookie) {
      this.persistToStorage(fromCookie);
      return fromCookie;
    }

    const fromStorage = readStorage(STORAGE_KEY);
    if (fromStorage) {
      this.writeCookie(fromStorage);
      return fromStorage;
    }

    const id = uuid();
    this.writeCookie(id);
    this.persistToStorage(id);
    return id;
  }

  /** Returns the id from cookie storage only — used by the alias flow. */
  static readCookieId(): string | null {
    return readCookie(COOKIE_NAME);
  }

  isOptedOut(): boolean {
    if (typeof window === "undefined") return false;
    if (readStorage(OPT_OUT_KEY) === "false") return true;
    return false;
  }

  private writeCookie(id: string): void {
    if (typeof document === "undefined") return;
    const expires = new Date(Date.now() + COOKIE_DAYS * 86400_000).toUTCString();
    const domainPart = this.cookieDomain ? `; domain=${this.cookieDomain}` : "";
    const securePart = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; expires=${expires}; path=/${domainPart}${securePart}; SameSite=Lax`;
  }

  private persistToStorage(id: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage unavailable (private mode, disabled cookies)
    }
  }
}

class BrowserTransport implements Transport {
  async send(url: string, body: string): Promise<void> {
    await fetch(url, {
      method: "POST",
      body,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
      credentials: "omit",
      mode: "cors",
    });
  }

  sendBeacon(url: string, body: string): boolean {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
      return false;
    }
    try {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      return navigator.sendBeacon(url, blob);
    } catch {
      return false;
    }
  }
}

export class WTS extends TelemetryClient {
  constructor(config: WebClientConfig) {
    super(config, new BrowserIdentity(config.cookieDomain, config.distinctId), new BrowserTransport());
  }

  trackPageView(properties: Record<string, unknown> = {}): void {
    if (typeof window === "undefined") return;
    this.track("page-view", properties, {
      url: window.location.href,
      referrer: document.referrer || undefined,
    });
  }

  /** Returns the id from the .webiny.com cookie if present. Used by the install/finish alias flow. */
  static getCookieId(): string | null {
    return BrowserIdentity.readCookieId();
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

function readStorage(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function deriveApexDomain(): string | null {
  if (typeof location === "undefined") return null;
  const host = location.hostname;
  if (!host || host === "localhost") return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 2) return null;
  return "." + parts.slice(-2).join(".");
}
