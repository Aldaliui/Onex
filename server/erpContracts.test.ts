import { describe, expect, it } from "vitest";
import { ErpContractError, buildImportKey, normalizeDecimal, validateAccountContract, validateCustomerContract, validateItemContract } from "./erpContracts";

describe("ERP unified contracts", () => {
  it("normalizes source references into stable import keys", () => {
    const account = validateAccountContract({ sourceSystem: "betasys", sourceId: "ACC-1", companyId: 1, code: "1100", name: "النقدية", accountType: "ASSET" });
    expect(account.sourceSystem).toBe("BETASYS");
    expect(buildImportKey(account, "ACCOUNT")).toBe("ACCOUNT:BETASYS:ACC-1");
  });

  it("validates account, item, and customer contracts", () => {
    expect(validateAccountContract({ sourceSystem: "MIDO", sourceId: "1", companyId: 1, code: "1100", name: "النقدية", accountType: "ASSET" }).currencyCode).toBe("SAR");
    expect(validateItemContract({ sourceSystem: "BETASYS", sourceId: "I-1", companyId: 1, code: "SKU-1", name: "صنف", unitCost: "10.5", salePrice: "15" }).unitCost).toBe("10.500000");
    expect(validateCustomerContract({ sourceSystem: "BETASYS", sourceId: "C-1", companyId: 1, code: "C-1", legalName: "عميل" }).status).toBe("ACTIVE");
  });

  it("rejects invalid source, currency, and decimal scale", () => {
    expect(() => normalizeDecimal("1.1234567", "AMOUNT")).toThrow("AMOUNT_SCALE_EXCEEDED");
    expect(() => validateAccountContract({ sourceSystem: "UNKNOWN" as any, sourceId: "1", companyId: 1, code: "1100", name: "نقدية", accountType: "ASSET" })).toThrow("SOURCE_SYSTEM_INVALID");
    expect(() => validateItemContract({ sourceSystem: "BETASYS", sourceId: "I-1", companyId: 1, code: "SKU-1", name: "صنف", currencyCode: "US1" })).toThrow("CURRENCY_INVALID");
  });

  it("exposes structured domain error details", () => {
    try { validateCustomerContract({ sourceSystem: "BETASYS", sourceId: "", companyId: 1, code: "C-1", legalName: "عميل" }); } catch (error) { expect(error).toBeInstanceOf(ErpContractError); expect((error as ErpContractError).code).toBe("SOURCE_ID_REQUIRED"); }
  });
});
