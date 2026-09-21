import { afterEach, describe, expect, it } from "vitest";
import { assertErpAction, assertLicensed, assertOpenPeriod, assertPermission, currencyPolicy, roundCurrency } from "./erpPolicy";

const original = { status: process.env.ONEX_LICENSE_STATUS, modules: process.env.ONEX_LICENSED_MODULES, enforce: process.env.ONEX_ENFORCE_PERMISSIONS };

afterEach(() => {
  for (const [key, value] of Object.entries({ ONEX_LICENSE_STATUS: original.status, ONEX_LICENSED_MODULES: original.modules, ONEX_ENFORCE_PERMISSIONS: original.enforce })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("unified ERP policy", () => {
  it("rounds every currency using the declared scale and half-up policy", () => {
    const policy = currencyPolicy({ code: "usd", decimalScale: 2, baseCurrency: "sar" });
    expect(policy).toMatchObject({ code: "USD", baseCurrency: "SAR", decimalScale: 2, rounding: "HALF_UP" });
    expect(roundCurrency("12.345", policy)).toBe(12.35);
    expect(roundCurrency("-12.345", policy)).toBe(-12.35);
  });

  it("rejects inactive licenses and disabled modules", () => {
    process.env.ONEX_LICENSE_STATUS = "EXPIRED";
    expect(() => assertLicensed("AR")).toThrow("LICENSE_INACTIVE");
    process.env.ONEX_LICENSE_STATUS = "ACTIVE";
    process.env.ONEX_LICENSED_MODULES = "GL";
    expect(() => assertLicensed("AR")).toThrow("LICENSE_MODULE_NOT_ENABLED:AR");
  });

  it("enforces action permissions when strict mode is enabled", () => {
    process.env.ONEX_ENFORCE_PERMISSIONS = "1";
    expect(() => assertPermission("user", "PERIOD_CLOSE")).toThrow("PERMISSION_DENIED:PERIOD_CLOSE");
    expect(() => assertPermission("admin", "PERIOD_CLOSE")).not.toThrow();
  });

  it("connects mutation policy to license and permission checks", () => {
    process.env.ONEX_ENFORCE_PERMISSIONS = "1";
    expect(() => assertErpAction({ role: "user", action: "INVOICE_POST", module: "AR" })).not.toThrow();
    expect(() => assertErpAction({ role: "user", action: "PERIOD_CLOSE", module: "GL" })).toThrow("PERMISSION_DENIED:PERIOD_CLOSE");
  });

  it("allows only open or reopened fiscal periods within their dates", () => {
    const period = { status: "OPEN", startsOn: "2026-01-01", endsOn: "2026-01-31" };
    expect(() => assertOpenPeriod(period, "2026-01-15")).not.toThrow();
    expect(() => assertOpenPeriod({ ...period, status: "CLOSED" }, "2026-01-15")).toThrow("PERIOD_CLOSED");
    expect(() => assertOpenPeriod(period, "2026-02-01")).toThrow("DATE_OUTSIDE_PERIOD");
  });
});
