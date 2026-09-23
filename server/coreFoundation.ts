import { and, asc, desc, eq, like, or } from "drizzle-orm";
import { getDb, saveCustomer, saveItem, saveSupplier, saveWarehouse } from "./db";
import {
  attachments,
  branches,
  companies,
  companyGroupMembers,
  companyGroups,
  currencies,
  documentDefinitions,
  documentEvents,
  documentSequences,
  exchangeRates,
  fiscalPeriods,
  masterDataImportRows,
  masterDataImports,
  notifications,
  permissions,
  rolePolicies,
  roles,
  taxCodes,
  userRoles,
  users,
} from "../drizzle/schema";

export type CoreEntity = "CUSTOMER" | "SUPPLIER" | "ITEM" | "WAREHOUSE";
export type ImportRow = Record<string, string | number | null>;

const demo = {
  groups: [{ id: 1, code: "ONEX", name: "مجموعة Onex", baseCurrency: "SAR", active: 1 }],
  companies: [{ id: 1, code: "MAIN", name: "شركة Onex الرئيسية", baseCurrency: "SAR" }],
  currencies: [{ id: 1, code: "SAR", name: "الريال السعودي", decimalScale: 2, active: 1 }, { id: 2, code: "USD", name: "الدولار الأمريكي", decimalScale: 2, active: 1 }],
  taxes: [{ id: 1, companyId: 1, code: "VAT15", name: "ضريبة القيمة المضافة 15%", rate: "15.0000", category: "STANDARD", active: 1 }],
};

function text(value: unknown) { return String(value ?? "").trim(); }
function positiveNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
function parseCsv(csv: string): ImportRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const parseLine = (line: string) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((cell) => cell.trim().replace(/^\"|\"$/g, ""));
  const headers = parseLine(lines[0]).map((header) => header.toLowerCase());
  return lines.slice(1).map((line) => Object.fromEntries(parseLine(line).map((value, index) => [headers[index] || `column_${index + 1}`, value])));
}
function validateRow(entityType: CoreEntity, row: ImportRow, companyId: number) {
  const errors: string[] = [];
  const code = text(row.code || row.customer_code || row.supplier_code || row.item_code || row.warehouse_code);
  const name = text(row.name || row.legalname || row.legal_name || row.description);
  if (!code) errors.push("CODE_REQUIRED");
  if (!name) errors.push("NAME_REQUIRED");
  if (entityType !== "WAREHOUSE" && entityType !== "ITEM" && !text(row.currencycode || row.currency_code || "SAR")) errors.push("CURRENCY_REQUIRED");
  if (entityType === "ITEM") {
    if (!text(row.unitcode || row.unit_code || "EA")) errors.push("UNIT_REQUIRED");
    if (!text(row.revenueaccount || row.revenue_account)) errors.push("REVENUE_ACCOUNT_REQUIRED");
    if (!text(row.inventoryaccount || row.inventory_account)) errors.push("INVENTORY_ACCOUNT_REQUIRED");
    if (!text(row.cogsaccount || row.cogs_account)) errors.push("COGS_ACCOUNT_REQUIRED");
  }
  if (entityType === "WAREHOUSE" && !positiveNumber(row.companyid || row.company_id || companyId)) errors.push("COMPANY_REQUIRED");
  return { errors, normalized: { companyId, code, name, currencyCode: text(row.currencycode || row.currency_code || "SAR").toUpperCase(), unitCode: text(row.unitcode || row.unit_code || "EA"), revenueAccount: text(row.revenueaccount || row.revenue_account || "4100"), inventoryAccount: text(row.inventoryaccount || row.inventory_account || "1300"), cogsAccount: text(row.cogsaccount || row.cogs_account || "5100") } };
}

export async function getCoreFoundationSnapshot(companyId = 1, search = "", limit = 100) {
  const db = await getDb();
  if (!db) return { ...demo, branches: [{ id: 1, companyId, code: "MAIN", name: "الفرع الرئيسي", active: 1 }], fiscalPeriods: [{ id: 1, companyId, code: "2026-01", startsOn: new Date("2026-01-01"), endsOn: new Date("2026-01-31"), status: "OPEN" }], roles: [{ id: 1, code: "admin", name: "مدير النظام", active: 1 }, { id: 2, code: "user", name: "مستخدم", active: 1 }], permissions: [], users: [{ id: 1, openId: "local:administrator", name: "مدير النظام", email: "administrator@local.onex", role: "admin" }], documentDefinitions: [{ id: 1, companyId, documentType: "INVOICE", displayName: "فاتورة", prefix: "INV", approvalRequired: 1, postingRequired: 1, active: 1 }], notifications: [] };
  const query = text(search);
  const companyFilter = eq(companies.id, companyId);
  const branchFilter = query ? and(eq(branches.companyId, companyId), or(like(branches.code, `%${query}%`), like(branches.name, `%${query}%`))) : eq(branches.companyId, companyId);
  const [companyRows, branchRows, groupRows, currencyRows, rateRows, taxRows, periodRows, roleRows, permissionRows, userRows, policyRows, definitionRows, sequenceRows, notificationRows] = await Promise.all([
    db.select().from(companies).where(companyFilter).limit(20),
    db.select().from(branches).where(branchFilter).orderBy(asc(branches.code)).limit(limit),
    db.select().from(companyGroups).where(eq(companyGroups.active, 1)).orderBy(asc(companyGroups.code)).limit(limit),
    db.select().from(currencies).where(eq(currencies.active, 1)).orderBy(asc(currencies.code)).limit(limit),
    db.select().from(exchangeRates).where(eq(exchangeRates.companyId, companyId)).orderBy(desc(exchangeRates.rateDate)).limit(limit),
    db.select().from(taxCodes).where(eq(taxCodes.companyId, companyId)).orderBy(asc(taxCodes.code)).limit(limit),
    db.select().from(fiscalPeriods).where(eq(fiscalPeriods.companyId, companyId)).orderBy(desc(fiscalPeriods.startsOn)).limit(limit),
    db.select().from(roles).where(eq(roles.active, 1)).orderBy(asc(roles.code)).limit(limit),
    db.select().from(permissions).orderBy(asc(permissions.code)).limit(limit),
    db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn }).from(users).orderBy(desc(users.lastSignedIn)).limit(limit),
    db.select().from(rolePolicies).where(eq(rolePolicies.active, 1)).limit(limit),
    db.select().from(documentDefinitions).where(and(eq(documentDefinitions.companyId, companyId), eq(documentDefinitions.active, 1))).orderBy(asc(documentDefinitions.documentType)).limit(limit),
    db.select().from(documentSequences).where(eq(documentSequences.companyId, companyId)).orderBy(asc(documentSequences.documentType)).limit(limit),
    db.select().from(notifications).where(and(eq(notifications.userId, 1), eq(notifications.companyId, companyId))).orderBy(desc(notifications.createdAt)).limit(20),
  ]);
  return { companies: companyRows, branches: branchRows, groups: groupRows, currencies: currencyRows, exchangeRates: rateRows, taxes: taxRows, fiscalPeriods: periodRows, roles: roleRows, permissions: permissionRows, users: userRows, policies: policyRows, documentDefinitions: definitionRows, documentSequences: sequenceRows, notifications: notificationRows };
}

export async function previewMasterDataImport(input: { companyId: number; entityType: CoreEntity; fileName: string; csv: string; actor: string }) {
  const rows = parseCsv(input.csv);
  const checked = rows.map((row, index) => ({ rowNo: index + 2, raw: row, ...validateRow(input.entityType, row, input.companyId) }));
  const validRows = checked.filter((row) => row.errors.length === 0);
  const db = await getDb();
  if (db) {
    const inserted = await db.insert(masterDataImports).values({ companyId: input.companyId, entityType: input.entityType, fileName: input.fileName, status: validRows.length === checked.length ? "VALIDATED" : "PREVIEW", totalRows: checked.length, validRows: validRows.length, invalidRows: checked.length - validRows.length, actor: input.actor }).$returningId();
    const importId = Number(inserted[0]?.id);
    if (importId) await db.insert(masterDataImportRows).values(checked.map((row) => ({ importId, rowNo: row.rowNo, rawJson: JSON.stringify(row.raw), normalizedJson: JSON.stringify(row.normalized), status: (row.errors.length ? "INVALID" : "VALID") as "INVALID" | "VALID", errorsJson: row.errors.length ? JSON.stringify(row.errors) : null })));
    return { importId, entityType: input.entityType, totalRows: checked.length, validRows: validRows.length, invalidRows: checked.length - validRows.length, rows: checked };
  }
  return { importId: 0, entityType: input.entityType, totalRows: checked.length, validRows: validRows.length, invalidRows: checked.length - validRows.length, rows: checked };
}

export async function commitMasterDataImport(input: { importId: number; companyId: number; entityType: CoreEntity; rows: ImportRow[]; actor: string }) {
  if (!input.rows.length) throw new Error("IMPORT_EMPTY");
  const results: unknown[] = [];
  for (const row of input.rows) {
    const checked = validateRow(input.entityType, row, input.companyId);
    if (checked.errors.length) throw new Error(`IMPORT_ROW_INVALID:${checked.errors.join(",")}`);
    const normalized = checked.normalized;
    if (input.entityType === "CUSTOMER") results.push(await saveCustomer({ companyId: input.companyId, code: normalized.code, legalName: normalized.name, currencyCode: normalized.currencyCode, status: "ACTIVE" }));
    if (input.entityType === "SUPPLIER") results.push(await saveSupplier({ companyId: input.companyId, code: normalized.code, legalName: normalized.name, currencyCode: normalized.currencyCode, status: "ACTIVE" }));
    if (input.entityType === "ITEM") results.push(await saveItem({ companyId: input.companyId, code: normalized.code, description: normalized.name, stockFlag: 1, unitCost: "0", revenueAccount: normalized.revenueAccount, inventoryAccount: normalized.inventoryAccount, cogsAccount: normalized.cogsAccount, active: 1 }));
    if (input.entityType === "WAREHOUSE") results.push(await saveWarehouse({ companyId: input.companyId, code: normalized.code, name: normalized.name, active: 1 }));
  }
  const db = await getDb();
  if (db && input.importId) await db.update(masterDataImports).set({ status: "COMMITTED", committedAt: new Date() }).where(and(eq(masterDataImports.id, input.importId), eq(masterDataImports.companyId, input.companyId)));
  return { importId: input.importId, entityType: input.entityType, committed: results.length, results };
}

export async function markNotificationRead(input: { notificationId: number; userId: number }) {
  const db = await getDb();
  if (!db) return { notificationId: input.notificationId, readAt: new Date() };
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.notificationId), eq(notifications.userId, input.userId)));
  return { notificationId: input.notificationId, readAt: new Date() };
}

export function validateDocumentTransition(fromState: string | null | undefined, toState: string) {
  const from = text(fromState || "DRAFT").toUpperCase();
  const to = text(toState).toUpperCase();
  const allowed: Record<string, string[]> = { DRAFT: ["VALIDATED", "APPROVED", "CANCELLED"], VALIDATED: ["APPROVED", "CANCELLED"], APPROVED: ["POSTED", "CANCELLED"], POSTED: ["REVERSED"], REVERSED: [], CANCELLED: [] };
  if (!allowed[from]?.includes(to)) throw new Error(`DOCUMENT_TRANSITION_NOT_ALLOWED:${from}:${to}`);
  return { from, to };
}
