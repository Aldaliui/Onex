import { describe, expect, it } from "vitest";
import { requireWriteAuth } from "./worker.mjs";

describe("Worker write authentication", () => {
  it("rejects an actor header without a valid bearer token", () => {
    const request = new Request("https://onex.test/api/erp/invoices", {
      method: "POST",
      headers: { "x-onex-actor": "forged.actor" },
    });
    expect(() => requireWriteAuth(request, { ONEX_API_TOKEN: "server-token" })).toThrow();
  });

  it("rejects a wrong bearer token even when actor is present", () => {
    const request = new Request("https://onex.test/api/erp/invoices", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-token",
        "x-onex-actor": "forged.actor",
      },
    });
    expect(() => requireWriteAuth(request, { ONEX_API_TOKEN: "server-token" })).toThrow();
  });

  it("accepts the configured bearer token", () => {
    const request = new Request("https://onex.test/api/erp/invoices", {
      method: "POST",
      headers: {
        authorization: "Bearer server-token",
        "x-onex-actor": "trusted.actor",
      },
    });
    expect(() => requireWriteAuth(request, { ONEX_API_TOKEN: "server-token" })).not.toThrow();
  });
});
