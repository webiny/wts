export type EventSource = "site" | "docs" | "learn" | "admin" | "cli";

export type EventProperties = Record<string, unknown>;

export interface TrackEvent {
  event: string;
  distinct_id: string;
  source: EventSource;
  properties: EventProperties;
  timestamp: string;
  url?: string;
  referrer?: string;
}

export interface AliasEvent {
  event: "$create_alias";
  distinct_id: string;
  alias: string;
  source: EventSource;
  timestamp: string;
}

export type AnyEvent = TrackEvent | AliasEvent;

export interface ClientConfig {
  source: EventSource;
  apiUrl?: string;
  debug?: boolean;
}
