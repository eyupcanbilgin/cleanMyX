const SECRET_KEYS = [
  "authorization",
  "access_token",
  "refresh_token",
  "code",
  "code_verifier",
  "client_secret",
  "token",
];

export function redactString(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

export function redactSecrets<T>(input: T, seen = new WeakSet<object>()): T {
  if (input === null || input === undefined) return input;

  if (Array.isArray(input)) {
    if (seen.has(input)) return "[Circular]" as unknown as T;
    seen.add(input);
    return input.map((v) => redactSecrets(v, seen)) as unknown as T;
  }

  if (typeof input === "object") {
    if (seen.has(input as object)) return "[Circular]" as unknown as T;
    seen.add(input as object);

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (SECRET_KEYS.includes(lk)) {
        out[k] = typeof v === "string" ? redactString(v) : "***";
      } else {
        out[k] = redactSecrets(v, seen);
      }
    }
    return out as T;
  }

  return input;
}

