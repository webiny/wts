import {
  RETRYABLE_STATUS_CODES,
  TelemetryClient,
  getRetryDelay,
  sleep,
  uuid,
  type Identity,
  type Transport
} from "./core.js";
import type { ClientConfig, EventProperties } from "./types.js";

/**
 * Minimal surface of the posthog-js default export that we rely on. We avoid a
 * type dependency on posthog-js (it's an optional peer dep) and only describe
 * the two methods we call.
 */
interface PostHogLike {
  init: (key: string, options: Record<string, unknown>) => void;
  get_session_id?: () => string | undefined;
}

/**
 * What `loadPostHog` may resolve to: either the posthog-js module namespace
 * (`{ default: posthog }`, as returned by `import("posthog-js")`) or the
 * posthog instance directly.
 */
type PostHogModule = { default: PostHogLike } | PostHogLike;

const COOKIE_NAME = "wts_did";
const STORAGE_KEY = "wts_did";
const OPT_OUT_KEY = "WEBINY_TELEMETRY";
const COOKIE_DAYS = 90;

export interface SessionRecordingConfig {
  /**
   * PostHog public project API key (safe to expose in the browser bundle).
   * If omitted or empty (e.g. the env var wasn't set at build time), recording
   * is skipped with a console warning — the rest of WTS keeps working.
   */
  posthogKey?: string;
  /** PostHog API host — typically a reverse-proxy domain (e.g. "https://s.webiny.com"). */
  apiHost: string;
  /** CSS selector for text that should be masked in recordings. Defaults to `[data-private]`. */
  maskTextSelector?: string;
  /**
   * Loads the posthog-js module. WTS never imports posthog-js itself — that way
   * consumers which don't record (e.g. the Webiny admin app) don't trigger a
   * build-time resolution of an uninstalled optional dependency. Recording
   * consumers pass `() => import("posthog-js")` so the import resolves inside
   * *their* bundle, where posthog-js is installed. Required to enable recording;
   * if omitted, recording is skipped with a console warning.
   */
  loadPostHog?: () => Promise<PostHogModule>;
}

export interface WebClientConfig extends ClientConfig {
  cookieDomain?: string;
  /**
   * Force a specific distinct_id (e.g. when running on CloudFront and reading
   * an id passed via URL params). When provided, this id is used as-is and is
   * persisted to localStorage so it survives page refreshes within the app.
   */
  distinctId?: string;
  /**
   * Opt-in PostHog browser-side session recording. When omitted, posthog-js is not
   * loaded — consumers that don't enable recording pay zero bundle cost. Consumers
   * that do enable it must install `posthog-js` and pass `loadPostHog` (see
   * {@link SessionRecordingConfig.loadPostHog}); WTS never imports it directly.
   */
  sessionRecording?: SessionRecordingConfig;
  /** Number of retry attempts for transient HTTP errors. Defaults to 3. */
  retries?: number;
  /** Base delay in ms between retries (exponential backoff). Defaults to 200. */
  retryDelay?: number;
}

class BrowserIdentity implements Identity {
  private cookieDomain: string | null;
  private fixedId: string | null;

  constructor(cookieDomain?: string, fixedId?: string) {
    this.cookieDomain = cookieDomain ?? deriveApexDomain();
    this.fixedId = fixedId ?? null;
  }

  getDistinctId(): string | null {
    if (typeof document === "undefined") {
      return null;
    }

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
    if (typeof window === "undefined") {
      return false;
    }
    if (readStorage(OPT_OUT_KEY) === "false") {
      return true;
    }
    return false;
  }

  private writeCookie(id: string): void {
    if (typeof document === "undefined") {
      return;
    }
    const expires = new Date(Date.now() + COOKIE_DAYS * 86400_000).toUTCString();
    const domainPart = this.cookieDomain ? `; domain=${this.cookieDomain}` : "";
    const securePart = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
      id
    )}; expires=${expires}; path=/${domainPart}${securePart}; SameSite=Lax`;
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
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          keepalive: true,
          credentials: "omit",
          mode: "cors"
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

let sessionRecordingStarted = false;

export class WTS extends TelemetryClient {
  /**
   * Set once posthog-js finishes loading (only when session recording is
   * enabled). Used to stamp the active replay `$session_id` onto outgoing
   * events so PostHog can link them to recordings. Stays null otherwise.
   */
  private posthog: PostHogLike | null = null;

  constructor(config: WebClientConfig) {
    super(
      config,
      new BrowserIdentity(config.cookieDomain, config.distinctId),
      new BrowserTransport(config.retries ?? 3, config.retryDelay ?? 200)
    );

    if (config.sessionRecording) {
      this.startSessionRecording(config.sessionRecording);
    }
  }

  /**
   * Stamps the active session-recording `$session_id` onto every event so
   * PostHog can use the event to filter recordings. The id is read at call
   * time because it rotates over the lifetime of a session. Events fired
   * before posthog-js finishes loading (e.g. the first pageview of a cold
   * load) go out without it — they're still captured, just not linked.
   */
  override track(
    event: string,
    properties: EventProperties = {},
    context: { url?: string; referrer?: string } = {}
  ): void {
    const sessionId = this.posthog?.get_session_id?.();
    const merged = sessionId ? { ...properties, $session_id: sessionId } : properties;
    super.track(event, merged, context);
  }

  private startSessionRecording(cfg: SessionRecordingConfig): void {
    if (typeof window === "undefined") {
      return;
    }
    if (sessionRecordingStarted) {
      return;
    }
    if (this.identity.isOptedOut()) {
      this.debug("opted out, skipping session recording");
      return;
    }
    const posthogKey = cfg.posthogKey;
    if (!posthogKey) {
      // eslint-disable-next-line no-console
      console.warn(
        "[wts] session recording is configured but no PostHog key was provided — skipping. " +
          "Set the posthogKey field (e.g. from NEXT_PUBLIC_POSTHOG_KEY) to enable replays."
      );
      return;
    }
    if (!cfg.loadPostHog) {
      // eslint-disable-next-line no-console
      console.warn(
        "[wts] session recording is configured but no loadPostHog loader was provided — skipping. " +
          "Provide loadPostHog (a loader that dynamically imports the posthog-js module) so the SDK resolves inside your bundle."
      );
      return;
    }
    const distinctId = this.identity.getDistinctId();
    if (!distinctId) {
      this.debug("no distinct_id available, skipping session recording");
      return;
    }
    sessionRecordingStarted = true;

    cfg
      .loadPostHog()
      .then(mod => {
        const posthog = ("default" in mod ? mod.default : mod) as PostHogLike;
        this.posthog = posthog;
        posthog.init(posthogKey, {
          api_host: cfg.apiHost,
          // WTS owns event capture via wts-server. The PostHog browser SDK is
          // recording-only here; disable everything else so events don't
          // bypass the relay and duplicate in PostHog.
          capture_pageview: false,
          capture_pageleave: false,
          autocapture: false,
          disable_session_recording: false,
          bootstrap: { distinctID: distinctId },
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: cfg.maskTextSelector ?? "[data-private]"
          }
        });
        this.debug("session recording started", distinctId);
      })
      .catch(err => {
        this.debug("session recording failed to load", err);
      });
  }

  trackPageView(properties: Record<string, unknown> = {}): void {
    if (typeof window === "undefined") {
      return;
    }
    this.track("page-view", properties, {
      url: window.location.href,
      referrer: document.referrer || undefined
    });
  }

  /** Returns the id from the .webiny.com cookie if present. Used by the install/finish alias flow. */
  static getCookieId(): string | null {
    return BrowserIdentity.readCookieId();
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

function readStorage(key: string): string | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function deriveApexDomain(): string | null {
  if (typeof location === "undefined") {
    return null;
  }
  const host = location.hostname;
  if (!host || host === "localhost") {
    return null;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return null;
  }
  const parts = host.split(".");
  if (parts.length < 2) {
    return null;
  }
  return "." + parts.slice(-2).join(".");
}
