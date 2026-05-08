import { MockXApiClient } from "./mock-x-client.js";
import { RealXApiClient } from "./real-x-client.js";
import type { XApiClient } from "./x-api-client.js";

export type XClientFactoryEnv = {
  X_USE_REAL?: string;
};

export function createXApiClient(env: XClientFactoryEnv = process.env): XApiClient {
  const useReal = (env.X_USE_REAL ?? "false").toLowerCase() === "true";
  if (!useReal) return new MockXApiClient();
  return new RealXApiClient();
}

