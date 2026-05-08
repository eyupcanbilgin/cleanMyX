import "dotenv/config";

export type WorkerConfig = {
  redisUrl: string;
  tokenEncKeyBase64: string;
};

export function getWorkerConfig(): WorkerConfig {
  return {
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    tokenEncKeyBase64: process.env.TOKEN_ENC_KEY ?? "",
  };
}

