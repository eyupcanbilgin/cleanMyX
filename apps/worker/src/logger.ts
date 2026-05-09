import pino from "pino";
import { redactSecrets } from "@xcleaner/crypto";

export function createLogger() {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    hooks: {
      logMethod(args, method) {
        const safeArgs = args.map((a) =>
          typeof a === "object" ? redactSecrets(a) : a
        );
        return method.apply(this, safeArgs as unknown as Parameters<typeof method>);
      },
    },
  });
}

