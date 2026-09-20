import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;

describe("Oracle/FM X bridge", () => {
  it("requires an authenticated session for window execution", async () => {
    const api = appRouter.createCaller(ctx);
    await expect(api.windows.executeAction({ legacyForm: "GLST001.fmx", action: "query" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
