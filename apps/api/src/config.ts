import "dotenv/config";

export type AppConfig = {
  port: number;
  webBaseUrl: string;
  apiBaseUrl: string;
  xClientId?: string;
  xClientSecret?: string;
  xRedirectUri: string;
  tokenEncKeyBase64: string;
  xUseReal: boolean;
  redisUrl: string;
};

export function getConfig(): AppConfig {
  const port = Number(process.env.PORT ?? "4000");
  const webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3000";
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
  const xRedirectUri =
    process.env.X_REDIRECT_URI ?? `${apiBaseUrl}/auth/x/callback`;
  const tokenEncKeyBase64 = process.env.TOKEN_ENC_KEY ?? "";
  const xUseReal = (process.env.X_USE_REAL ?? "false").toLowerCase() === "true";
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  return {
    port,
    webBaseUrl,
    apiBaseUrl,
    xClientId: process.env.X_CLIENT_ID,
    xClientSecret: process.env.X_CLIENT_SECRET,
    xRedirectUri,
    tokenEncKeyBase64,
    xUseReal,
    redisUrl,
  };
}

