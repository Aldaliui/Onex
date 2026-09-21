import { describe, expect, it } from "vitest";
import { assertSystemAdmin } from "./systemAdministration";

describe("system administration access control", () => {
  it("rejects non-admin actors", () => {
    expect(() => assertSystemAdmin({ role: "user", openId: "user-1" })).toThrow("SYSTEM_ADMIN_REQUIRED");
  });

  it("accepts an admin actor", () => {
    expect(() => assertSystemAdmin({ role: "admin", openId: "admin-1" })).not.toThrow();
  });
});
