import { and, desc, eq, isNull, like, or } from "drizzle-orm";
import { auditEvents, branches, permissions, rolePermissions, roles, userRoles, users } from "../drizzle/schema";
import { getDb } from "./db";

export type AdminActor = { id?: number; openId?: string; name?: string | null; role?: string };

export function assertSystemAdmin(actor: AdminActor) {
  if (actor.role !== "admin") throw new Error("SYSTEM_ADMIN_REQUIRED");
}

function requestId(prefix: string, ...parts: unknown[]) {
  return `${prefix}:${parts.map((part) => String(part)).join(":")}`;
}

export async function getSystemAdministration(input: { search?: string; companyId?: number } = {}, actor: AdminActor) {
  assertSystemAdmin(actor);
  const db = await getDb();
  if (!db) return {
    users: [], roles: [], permissions: [], branches: [], userRoles: [], rolePermissions: [], audit: [], stats: { users: 0, activeUsers: 0, roles: 0, permissions: 0, branches: 0, recentAudit: 0 },
  };
  const query = (input.search || "").trim();
  const userFilter = query ? or(like(users.openId, `%${query}%`), like(users.email, `%${query}%`), like(users.name, `%${query}%`)) : undefined;
  const branchFilter = input.companyId ? eq(branches.companyId, input.companyId) : undefined;
  const [userRows, roleRows, permissionRows, branchRows, userRoleRows, rolePermissionRows, auditRows] = await Promise.all([
    db.select({ id: users.id, openId: users.openId, name: users.name, email: users.email, role: users.role, loginMethod: users.loginMethod, lastSignedIn: users.lastSignedIn, createdAt: users.createdAt }).from(users).where(userFilter).orderBy(users.id).limit(200),
    db.select({ id: roles.id, code: roles.code, name: roles.name, active: roles.active }).from(roles).orderBy(roles.code).limit(200),
    db.select({ id: permissions.id, code: permissions.code, windowCode: permissions.windowCode, actionCode: permissions.actionCode, description: permissions.description }).from(permissions).orderBy(permissions.code).limit(500),
    db.select().from(branches).where(branchFilter).orderBy(branches.code).limit(200),
    db.select({ id: userRoles.id, userId: userRoles.userId, roleId: userRoles.roleId, branchId: userRoles.branchId }).from(userRoles).limit(1000),
    db.select({ id: rolePermissions.id, roleId: rolePermissions.roleId, permissionId: rolePermissions.permissionId }).from(rolePermissions).limit(2000),
    db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(50),
  ]);
  return {
    users: userRows,
    roles: roleRows,
    permissions: permissionRows,
    branches: branchRows,
    userRoles: userRoleRows,
    rolePermissions: rolePermissionRows,
    audit: auditRows,
    stats: { users: userRows.length, activeUsers: userRows.filter((row) => row.role === "admin" || row.lastSignedIn).length, roles: roleRows.length, permissions: permissionRows.length, branches: branchRows.length, recentAudit: auditRows.length },
  };
}

export async function saveSystemRole(input: { id?: number; code: string; name: string; active?: number }, actor: AdminActor) {
  assertSystemAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_ROLE");
  const isNew = !input.id;
  const values = { code: input.code.trim().toUpperCase(), name: input.name.trim(), active: input.active ?? 1 };
  if (!values.code || !values.name) throw new Error("ROLE_CODE_AND_NAME_REQUIRED");
  if (input.id) {
    await db.update(roles).set(values).where(eq(roles.id, input.id));
  } else {
    const inserted = await db.insert(roles).values(values).$returningId();
    input = { ...input, id: Number(inserted[0]?.id) };
  }
  const id = input.id;
  await db.insert(auditEvents).values({ actor: actor.openId || actor.name || "system-admin", actionCode: isNew ? "CREATE" : "UPDATE", entityType: "ROLE", entityId: String(id), requestId: requestId("ROLE", id) });
  return db.select().from(roles).where(eq(roles.id, id!)).limit(1).then((rows) => rows[0]);
}

export async function saveSystemPermission(input: { id?: number; code: string; windowCode?: string; actionCode: string; description?: string }, actor: AdminActor) {
  assertSystemAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_PERMISSION");
  const values = { code: input.code.trim().toUpperCase(), windowCode: input.windowCode?.trim() || null, actionCode: input.actionCode.trim().toUpperCase(), description: input.description?.trim() || null };
  if (!values.code || !values.actionCode) throw new Error("PERMISSION_CODE_AND_ACTION_REQUIRED");
  let id = input.id;
  if (id) await db.update(permissions).set(values).where(eq(permissions.id, id));
  else { const inserted = await db.insert(permissions).values(values).$returningId(); id = Number(inserted[0]?.id); }
  await db.insert(auditEvents).values({ actor: actor.openId || actor.name || "system-admin", actionCode: input.id ? "UPDATE" : "CREATE", entityType: "PERMISSION", entityId: String(id), requestId: requestId("PERMISSION", id) });
  return db.select().from(permissions).where(eq(permissions.id, id!)).limit(1).then((rows) => rows[0]);
}

export async function assignSystemUserRole(input: { userId: number; roleId: number; branchId?: number }, actor: AdminActor) {
  assertSystemAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_USER_ROLE");
  const existing = await db.select().from(userRoles).where(and(eq(userRoles.userId, input.userId), eq(userRoles.roleId, input.roleId), input.branchId ? eq(userRoles.branchId, input.branchId) : isNull(userRoles.branchId))).limit(1);
  if (!existing.length) await db.insert(userRoles).values({ userId: input.userId, roleId: input.roleId, branchId: input.branchId || null });
  await db.insert(auditEvents).values({ actor: actor.openId || actor.name || "system-admin", actionCode: "ASSIGN_ROLE", entityType: "USER", entityId: String(input.userId), requestId: requestId("USER_ROLE", input.userId, input.roleId, input.branchId || "ALL") });
  return { userId: input.userId, roleId: input.roleId, branchId: input.branchId || null, idempotent: existing.length > 0 };
}

export async function assignSystemRolePermission(input: { roleId: number; permissionId: number }, actor: AdminActor) {
  assertSystemAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_ROLE_PERMISSION");
  const existing = await db.select().from(rolePermissions).where(and(eq(rolePermissions.roleId, input.roleId), eq(rolePermissions.permissionId, input.permissionId))).limit(1);
  if (!existing.length) await db.insert(rolePermissions).values(input);
  await db.insert(auditEvents).values({ actor: actor.openId || actor.name || "system-admin", actionCode: "ASSIGN_PERMISSION", entityType: "ROLE", entityId: String(input.roleId), requestId: requestId("ROLE_PERMISSION", input.roleId, input.permissionId) });
  return { ...input, idempotent: existing.length > 0 };
}

export async function removeSystemUserRole(id: number, actor: AdminActor) {
  assertSystemAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_USER_ROLE");
  await db.delete(userRoles).where(eq(userRoles.id, id));
  await db.insert(auditEvents).values({ actor: actor.openId || actor.name || "system-admin", actionCode: "REMOVE_ROLE", entityType: "USER_ROLE", entityId: String(id), requestId: requestId("USER_ROLE_REMOVE", id) });
  return { id, removed: true };
}

export async function removeSystemRolePermission(id: number, actor: AdminActor) {
  assertSystemAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_REQUIRED_FOR_ROLE_PERMISSION");
  await db.delete(rolePermissions).where(eq(rolePermissions.id, id));
  await db.insert(auditEvents).values({ actor: actor.openId || actor.name || "system-admin", actionCode: "REMOVE_PERMISSION", entityType: "ROLE_PERMISSION", entityId: String(id), requestId: requestId("ROLE_PERMISSION_REMOVE", id) });
  return { id, removed: true };
}
