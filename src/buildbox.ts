import { Container } from "@cloudflare/containers";
import type { Env } from "./types";

export class BuildBox extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "10m";
}
