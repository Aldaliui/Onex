import { and, eq } from "drizzle-orm";
import { branches, companies, erpContextEvents, erpUserContexts, fiscalPeriods, warehouses } from "../drizzle/schema";
import { getDb } from "./db";
import { buildContextEvent, normalizeErpContext, type NormalizedErpContext } from "./erpContext";

const demoContexts = new Map<number, NormalizedErpContext>();

function mapContext(row: any): NormalizedErpContext {
  return {
    companyId: Number(row.companyId),
    branchId: row.branchId == null ? null : Number(row.branchId),
    warehouseId: row.warehouseId == null ? null : Number(row.warehouseId),
    fiscalPeriodId: row.fiscalPeriodId == null ? null : Number(row.fiscalPeriodId),
    currencyCode: String(row.currencyCode || "SAR"),
    languageCode: String(row.languageCode || "ar"),
  };
}

async function assertContextReferences(tx: any, context: NormalizedErpContext) {
  const company = (await tx.select().from(companies).where(eq(companies.id, context.companyId)).limit(1))[0];
  if (!company) throw new Error("CONTEXT_COMPANY_NOT_FOUND");
  if (context.branchId !== null) {
    const branch = (await tx.select().from(branches).where(and(eq(branches.id, context.branchId), eq(branches.companyId, context.companyId))).limit(1))[0];
    if (!branch) throw new Error("CONTEXT_BRANCH_NOT_IN_COMPANY");
  }
  if (context.warehouseId !== null) {
    const warehouse = (await tx.select().from(warehouses).where(and(eq(warehouses.id, context.warehouseId), eq(warehouses.companyId, context.companyId))).limit(1))[0];
    if (!warehouse) throw new Error("CONTEXT_WAREHOUSE_NOT_IN_COMPANY");
  }
  if (context.fiscalPeriodId !== null) {
    const period = (await tx.select().from(fiscalPeriods).where(and(eq(fiscalPeriods.id, context.fiscalPeriodId), eq(fiscalPeriods.companyId, context.companyId))).limit(1))[0];
    if (!period) throw new Error("CONTEXT_PERIOD_NOT_IN_COMPANY");
  }
}

export async function getErpContext(userId: number) {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error("CONTEXT_USER_REQUIRED");
  const db = await getDb();
  if (!db) return demoContexts.get(userId) || null;
  const row = (await db.select().from(erpUserContexts).where(eq(erpUserContexts.userId, userId)).limit(1))[0];
  return row ? mapContext(row) : null;
}

export async function setErpContext(input: { userId: number; actor: string; requestId: string; context: Parameters<typeof normalizeErpContext>[0] }) {
  const next = normalizeErpContext(input.context);
  const event = buildContextEvent({ userId: input.userId, actor: input.actor, requestId: input.requestId, previous: await getErpContext(input.userId), next });
  const db = await getDb();
  if (!db) {
    demoContexts.set(input.userId, next);
    return { context: next, event: { actionCode: event.actionCode, requestId: event.requestId } };
  }
  return db.transaction(async (tx) => {
    await assertContextReferences(tx, next);
    const existing = (await tx.select().from(erpUserContexts).where(eq(erpUserContexts.userId, input.userId)).limit(1))[0];
    let contextId: number;
    if (existing) {
      contextId = Number(existing.id);
      await tx.update(erpUserContexts).set({ companyId: next.companyId, branchId: next.branchId, warehouseId: next.warehouseId, fiscalPeriodId: next.fiscalPeriodId, currencyCode: next.currencyCode, languageCode: next.languageCode, updatedBy: event.actor, updatedAt: new Date() }).where(eq(erpUserContexts.userId, input.userId));
    } else {
      const inserted = await tx.insert(erpUserContexts).values({ userId: input.userId, companyId: next.companyId, branchId: next.branchId, warehouseId: next.warehouseId, fiscalPeriodId: next.fiscalPeriodId, currencyCode: next.currencyCode, languageCode: next.languageCode, updatedBy: event.actor }).$returningId();
      contextId = Number(inserted[0]?.id);
      if (!contextId) throw new Error("CONTEXT_CREATE_FAILED");
    }
    await tx.insert(erpContextEvents).values({ userId: event.userId, contextId, actionCode: event.actionCode, previousJson: event.previous ? JSON.stringify(event.previous) : null, nextJson: event.next ? JSON.stringify(event.next) : null, actor: event.actor, requestId: event.requestId });
    return { context: next, event: { actionCode: event.actionCode, requestId: event.requestId } };
  });
}

export async function clearErpContext(input: { userId: number; actor: string; requestId: string }) {
  const previous = await getErpContext(input.userId);
  const event = buildContextEvent({ userId: input.userId, actor: input.actor, requestId: input.requestId, previous, next: null });
  const db = await getDb();
  if (!db) {
    demoContexts.delete(input.userId);
    return { cleared: true, event: { actionCode: event.actionCode, requestId: event.requestId } };
  }
  return db.transaction(async (tx) => {
    const existing = (await tx.select().from(erpUserContexts).where(eq(erpUserContexts.userId, input.userId)).limit(1))[0];
    if (existing) await tx.delete(erpUserContexts).where(eq(erpUserContexts.userId, input.userId));
    await tx.insert(erpContextEvents).values({ userId: event.userId, contextId: existing ? Number(existing.id) : null, actionCode: event.actionCode, previousJson: previous ? JSON.stringify(previous) : null, nextJson: null, actor: event.actor, requestId: event.requestId });
    return { cleared: true, event: { actionCode: event.actionCode, requestId: event.requestId } };
  });
}
