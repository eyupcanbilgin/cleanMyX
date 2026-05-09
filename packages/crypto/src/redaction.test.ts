import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redaction.js";

describe("redaction", () => {
  it("redacts secrets and handles circular objects", () => {
    const input: Record<string, unknown> = {
      access_token: "secret-access-token",
      nested: {},
    };
    input.self = input;

    const output = redactSecrets(input);

    expect(output.access_token).toBe("sec***ken");
    expect(output.self).toBe("[Circular]");
  });
});
