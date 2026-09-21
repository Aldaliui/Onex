import { and, desc, eq, inArray } from "drizzle-orm";
import { accounts, auditEvents, fiscalPeriodClosures, fiscalPeriods, invoices, journalEntries, journalEntryLines, permissions, rolePermissions, roles, userRoles } from "../drizzle/schema";
import { closeFiscalYear } from "./accountingCore";
import { buildCloseChecklist, buildFiscalCloseRequest, assertNoPeriodOverlap, assertPeriodStatus, assertWorkspacePermission, validateFiscalPeriod, type ErpWorkspaceRole } from "./erpWorkspace";
import { getDb } from "./db";

export async function listFiscalPeriods(companyId = 1) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fiscalPeriods).where(eq(fiscalPeriods.companyId, companyId)).orderBy(desc(fiscalPeriods.startsOn));
}

export async function createFiscalPeriod(input: { companyId?: number; code: string; startsOn: string; endsOn: string; actor: string; role: ErpWorkspaceRole }) {
  assertWorkspacePermission(input.role, "PERIOD_CREATE");
  const normalized = validateFiscalPeriod({ companyId: input.companyId || 1, code: input.code, startsOn: input.startsOn, endsOn: input.endsOn });
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_FISCAL_PERIOD");
  const existing = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.companyId, normalized.companyId));
  assertNoPeriodOverlap(existing, normalized);
  const inserted = await db.insert(fiscalPeriods).values({ companyId: normalized.companyId, code: normalized.code, startsOn: normalized.startsOn, endsOn: normalized.endsOn, status: "OPEN" }).$returningId();
  const id = Number(inserted[0]?.id);
  if (!id) throw new Error("FISCAL_PERIOD_CREATE_FAILED");
  await db.insert(auditEvents).values({ actor: input.actor, actionCode: "CREATE", entityType: "FISCAL_PERIOD", entityId: String(id), requestId: `PERIOD:CREATE:${normalized.companyId}:${normalized.code}` });
  return { id, code: normalized.code, status: "OPEN" as const };
}

async function periodCloseCounts(db: any, period: any) {
  const journals = await db.select().from(journalEntries).where(and(eq(journalEntries.companyId, period.companyId), eq(journalEntries.fiscalPeriodId, period.id)));
  const journalIds = journals.map((journal: any) => journal.id);
  const lines = journalIds.length ? await db.select().from(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, journalIds)) : [];
  const totals = new Map<number, { debit: number; credit: number }>();
  for (const line of lines) {
    const current = totals.get(line.journalEntryId) || { debit: 0, credit: 0 };
    current.debit += Number(line.debit || 0);
    current.credit += Number(line.credit || 0);
    totals.set(line.journalEntryId, current);
  }
  const unbalancedJournals = journals.filter((journal: any) => {
    const total = totals.get(journal.id) || { debit: 0, credit: 0 };
    return Math.abs(total.debit - total.credit) > 0.0005;
  }).length;
  const unpostedJournals = journals.filter((journal: any) => journal.status !== "POSTED" && journal.status !== "REVERSED").length;
  const draftInvoices = (await db.select().from(invoices).where(eq(invoices.status, "DRAFT"))).filter((invoice: any) => invoice.createdAt >= period.startsOn && invoice.createdAt <= period.endsOn).length;
  return { unpostedJournals, draftInvoices, unbalancedJournals };
}

export async function closeFiscalPeriod(input: { periodId: number; actor: string; role: ErpWorkspaceRole; requestId: string }) {
  const request = buildFiscalCloseRequest(input);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_FISCAL_CLOSE");
  return db.transaction(async (tx) => {
    const period = (await tx.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, request.periodId)).limit(1))[0];
    if (!period) throw new Error("FISCAL_PERIOD_NOT_FOUND");
    assertPeriodStatus(period.status, "OPEN");
    const counts = await periodCloseCounts(tx, period);
    const checklist = buildCloseChecklist(counts);
    if (!checklist.canClose) throw new Error(`FISCAL_CLOSE_BLOCKED:${JSON.stringify(checklist)}`);

    const journalRows = await tx.select().from(journalEntries).where(and(eq(journalEntries.companyId, period.companyId), eq(journalEntries.fiscalPeriodId, period.id), eq(journalEntries.status, "POSTED")));
    const journalIds = journalRows.map((journal: any) => journal.id);
    const lines = journalIds.length ? await tx.select().from(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, journalIds)) : [];
    const accountRows = lines.length ? await tx.select().from(accounts).where(and(eq(accounts.companyId, period.companyId), inArray(accounts.code, lines.map((line: any) => line.accountCode)))) : [];
    const types = new Map(accountRows.map((account: any) => [account.code, account.accountType]));
    const revenue = lines.filter((line: any) => types.get(line.accountCode) === "REVENUE").reduce((sum: number, line: any) => sum + Number(line.credit || 0) - Number(line.debit || 0), 0);
    const expenses = lines.filter((line: any) => types.get(line.accountCode) === "EXPENSE").reduce((sum: number, line: any) => sum + Number(line.debit || 0) - Number(line.credit || 0), 0);
    const closing = closeFiscalYear({ revenue: Math.max(0, revenue), expenses: Math.max(0, expenses), openingYear: period.endsOn.getFullYear() + 1 });
    const journalNo = `CLOSE-${period.companyId}-${period.code}`;
    const inserted = await tx.insert(journalEntries).values({ companyId: period.companyId, journalNo, fiscalPeriodId: period.id, sourceType: "YEAR_CLOSE", sourceDocumentNo: period.code, entryType: "YEAR_CLOSE", description: closing.description, totalDebit: closing.totalDebit.toFixed(6), totalCredit: closing.totalCredit.toFixed(6), status: "POSTED", postedAt: new Date(), idempotencyKey: `JOURNAL:YEAR_CLOSE:${period.companyId}:${period.code}`, createdBy: request.actor }).$returningId();
    const journalId = Number(inserted[0]?.id);
    if (!journalId) throw new Error("FISCAL_CLOSE_JOURNAL_CREATE_FAILED");
    await tx.insert(journalEntryLines).values(closing.lines.map((line: any, index: number) => ({ journalEntryId: journalId, lineNo: index + 1, accountCode: line.accountCode, description: line.description, debit: line.debit.toFixed(6), credit: line.credit.toFixed(6), baseDebit: line.debit.toFixed(6), baseCredit: line.credit.toFixed(6) })));
    await tx.update(fiscalPeriods).set({ status: "CLOSED" }).where(eq(fiscalPeriods.id, period.id));
    await tx.insert(fiscalPeriodClosures).values({ periodId: period.id, companyId: period.companyId, status: "COMPLETED", checklistJson: JSON.stringify({ ...checklist, revenue, expenses }), closingJournalId: journalId, actor: request.actor, requestId: request.requestId, closedAt: new Date() });
    await tx.insert(auditEvents).values({ actor: request.actor, actionCode: "CLOSE", entityType: "FISCAL_PERIOD", entityId: String(period.id), requestId: request.requestId });
    return { periodId: period.id, status: "CLOSED" as const, closingJournalId: journalId, checklist, revenue, expenses };
  });
}

export async function reopenFiscalPeriod(input: { periodId: number; actor: string; role: ErpWorkspaceRole; requestId: string }) {
  assertWorkspacePermission(input.role, "PERIOD_REOPEN");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_FISCAL_REOPEN");
  return db.transaction(async (tx) => {
    const period = (await tx.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, input.periodId)).limit(1))[0];
    if (!period) throw new Error("FISCAL_PERIOD_NOT_FOUND");
    assertPeriodStatus(period.status, "CLOSED");
    await tx.update(fiscalPeriods).set({ status: "OPEN" }).where(eq(fiscalPeriods.id, period.id));
    await tx.update(fiscalPeriodClosures).set({ status: "REOPENED", reopenedAt: new Date(), reopenedBy: input.actor }).where(eq(fiscalPeriodClosures.periodId, period.id));
    await tx.insert(auditEvents).values({ actor: input.actor, actionCode: "REOPEN", entityType: "FISCAL_PERIOD", entityId: String(period.id), requestId: input.requestId });
    return { periodId: period.id, status: "OPEN" as const };
  });
}

export async function assignUserRole(input: { userId: number; roleId: number; branchId?: number; actor: string; role: ErpWorkspaceRole }) {
  assertWorkspacePermission(input.role, "ROLE_ASSIGN");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_ROLE_ASSIGNMENT");
  await db.insert(userRoles).values({ userId: input.userId, roleId: input.roleId, branchId: input.branchId || null });
  await db.insert(auditEvents).values({ actor: input.actor, actionCode: "ASSIGN_ROLE", entityType: "USER", entityId: String(input.userId), requestId: `ROLE:ASSIGN:${input.userId}:${input.roleId}:${input.branchId || "ALL"}` });
  return { userId: input.userId, roleId: input.roleId, branchId: input.branchId || null };
}

export async function listWorkspaceRoles() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: roles.id, code: roles.code, name: roles.name, active: roles.active }).from(roles).where(eq(roles.active, 1));
}

export async function listWorkspacePermissions() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: permissions.id, code: permissions.code, actionCode: permissions.actionCode, description: permissions.description }).from(permissions);
}

export async function assignRolePermission(input: { roleId: number; permissionId: number; actor: string; role: ErpWorkspaceRole }) {
  assertWorkspacePermission(input.role, "ROLE_PERMISSION_EDIT");
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_PERMISSION_ASSIGNMENT");
  await db.insert(rolePermissions).values({ roleId: input.roleId, permissionId: input.permissionId });
  await db.insert(auditEvents).values({ actor: input.actor, actionCode: "ASSIGN_PERMISSION", entityType: "ROLE", entityId: String(input.roleId), requestId: `PERMISSION:ASSIGN:${input.roleId}:${input.permissionId}` });
  return { roleId: input.roleId, permissionId: input.permissionId };
}
