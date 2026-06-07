import type { SiteSession } from "./session";

export interface Env {
  SITE_SESSION: DurableObjectNamespace<SiteSession>;
  BUILD_BOX: DurableObjectNamespace<import("./buildbox").BuildBox>;
  SITES: KVNamespace;
  CF_ACCOUNT_ID: string;
  ZONE_ID: string;
  SITE_ZONE: string;
  CF_API_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  APP_PASSWORD: string;
  APP_PASSWORD_2?: string; // optional second accepted login password
  SESSION_SECRET: string;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SiteRecord {
  name: string;
  url: string;
  createdAt: number;
  updatedAt: number;
}
