import { describe, expect, it } from "vitest";
import { decryptString, encryptString } from "./aes256gcm.js";

describe("aes256gcm", () => {
  it("roundtrips plaintext", () => {
    const key = Buffer.from("a".repeat(32)).toString("base64");
    const payload = encryptString({ plaintext: "hello", keyBase64: key, aad: "aad" });
    const out = decryptString({ payload, keyBase64: key, aad: "aad" });
    expect(out).toBe("hello");
  });

  it("fails with wrong aad", () => {
    const key = Buffer.from("b".repeat(32)).toString("base64");
    const payload = encryptString({ plaintext: "hello", keyBase64: key, aad: "aad1" });
    expect(() => decryptString({ payload, keyBase64: key, aad: "aad2" })).toThrow();
  });
});

