import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { WTS, type WebClientConfig } from "./web.js";
import type { EventProperties } from "./types.js";

const TelemetryContext = createContext<WTS | null>(null);

export interface TelemetryProviderProps extends WebClientConfig {
  children: ReactNode;
}

export function TelemetryProvider({ children, ...config }: TelemetryProviderProps) {
  const client = useMemo(
    () => new WTS(config),
    // Identity for the client is controlled by config.source/apiUrl/distinctId — recreate only if those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.source, config.apiUrl, config.distinctId, config.cookieDomain, config.debug]
  );
  return <TelemetryContext.Provider value={client}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry(): WTS {
  const client = useContext(TelemetryContext);
  if (!client) {
    throw new Error("useTelemetry must be used inside a <TelemetryProvider>.");
  }
  return client;
}

/**
 * Fires a `page-view` event whenever `path` changes. The consumer is responsible for
 * supplying the path — typically from `usePathname()` (Next.js) or a router equivalent.
 *
 * @example
 * ```tsx
 * "use client";
 * import { usePathname, useSearchParams } from "next/navigation";
 * import { useTrackPageView } from "@webiny/wts-client/react";
 *
 * export function PageViewTracker() {
 *   const pathname = usePathname();
 *   const search = useSearchParams();
 *   const url = search.toString() ? `${pathname}?${search.toString()}` : pathname;
 *   useTrackPageView(url);
 *   return null;
 * }
 * ```
 */
export function useTrackPageView(path: string | null | undefined, properties: EventProperties = {}): void {
  const client = useTelemetry();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!path) return;
    if (lastPath.current === path) return;
    lastPath.current = path;
    client.trackPageView(properties);
    // properties is intentionally not in deps — page-view fires on path change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, client]);
}

export { WTS } from "./web.js";
export type { WebClientConfig } from "./web.js";
export type { EventSource, EventProperties } from "./types.js";
