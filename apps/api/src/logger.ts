import pino, { type LoggerOptions } from "pino";
import { redactSecrets } from "@xcleaner/crypto";

export function createLoggerOptions(): LoggerOptions {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.Authorization",
        "req.body.access_token",
        "req.body.refresh_token",
        "req.body.code",
        "req.body.code_verifier",
        "req.body.client_secret",
      ],
      remove: true,
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
    hooks: {
      logMethod(args, method) {
        // Best-effort additional redaction of arbitrary objects.
        const safeArgs = args.map((a) =>
          typeof a === "object" ? redactSecrets(a) : a
        );
        method.apply(this, safeArgs as unknown as Parameters<typeof method>);
      },
    },
  };
}

