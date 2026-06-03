import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

export class SiteSession extends DurableObject<Env> {}
