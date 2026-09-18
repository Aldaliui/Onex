import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";
import { accounts, auditEvents, branches, companies, customers, invoiceLines, invoices, items, journalEntries, journalEntryLines, stockBalances, stockMovements, suppliers, warehouses, windowExecutions } from "../drizzle/schema";
import { storageGetSignedUrl, storagePut } from "./storage";

const BACKUP_VERSION = 1;
const TABLES = ["companies", "accounts", "branches", "warehouses", "customers", "suppliers", "items", "invoices", "invoiceLines", "journalEntries", "journalEntryLines", "stockBalances", "stockMovements", "windowExecutions", "auditEvents"] as const;
type BackupPayload = { version: number; product: "ONEX"; createdAt: string; tables: Record<string, unknown[]>; offlineOperations?: unknown[] };

function key() { return createHash("sha256").update(process.env.ONEX_BACKUP_SECRET || process.env.JWT_SECRET || "onex-local-backup-secret").digest(); }
function encrypt(payload: string) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv); const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]); return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") }; }
function decrypt(input: { iv: string; tag: string; data: string }) { const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(input.iv, "base64")); decipher.setAuthTag(Buffer.from(input.tag, "base64")); return Buffer.concat([decipher.update(Buffer.from(input.data, "base64")), decipher.final()]).toString("utf8"); }

export function validateBackup(input: unknown): BackupPayload { if (!input || typeof input !== "object") throw new Error("BACKUP_INVALID_FORMAT"); const value = input as Partial<BackupPayload>; if (value.product !== "ONEX" || value.version !== BACKUP_VERSION || !value.createdAt || !value.tables || typeof value.tables !== "object") throw new Error("BACKUP_UNSUPPORTED_VERSION"); return value as BackupPayload; }

export async function createBackupSnapshot(offlineOperations: unknown[] = []): Promise<BackupPayload> {
  const db = await getDb(); const tables: Record<string, unknown[]> = {};
  if (!db) { return { version: BACKUP_VERSION, product: "ONEX", createdAt: new Date().toISOString(), tables: { companies: [], accounts: [], branches: [], warehouses: [], customers: [], suppliers: [], items: [], invoices: [], invoiceLines: [], journalEntries: [], journalEntryLines: [], stockBalances: [], stockMovements: [], windowExecutions: [], auditEvents: [] }, offlineOperations }; }
  const sources: Record<string, unknown> = { companies, accounts, branches, warehouses, customers, suppliers, items, invoices, invoiceLines, journalEntries, journalEntryLines, stockBalances, stockMovements, windowExecutions, auditEvents };
  for (const table of TABLES) tables[table] = await db.select().from(sources[table] as any);
  return { version: BACKUP_VERSION, product: "ONEX", createdAt: new Date().toISOString(), tables, offlineOperations };
}

export async function uploadBackupSnapshot(offlineOperations: unknown[] = []) { const snapshot = await createBackupSnapshot(offlineOperations); const envelope = encrypt(JSON.stringify(snapshot)); const keyName = `onex/backups/${snapshot.createdAt.replace(/[:.]/g, "-")}.onex-backup`; const uploaded = await storagePut(keyName, JSON.stringify({ algorithm: "AES-256-GCM", ...envelope }), "application/json"); return { ...uploaded, createdAt: snapshot.createdAt, version: snapshot.version, encrypted: true, tableCounts: Object.fromEntries(Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length])) }; }

export async function getBackupDownloadUrl(keyName: string) { return { url: await storageGetSignedUrl(keyName) }; }

export function decodeBackupEnvelope(input: unknown): BackupPayload { const value = input as any; if (value?.algorithm === "AES-256-GCM" && value.iv && value.tag && value.data) return validateBackup(JSON.parse(decrypt(value))); return validateBackup(input); }

export async function restoreBackupSnapshot(input: unknown) { const snapshot = decodeBackupEnvelope(input); const counts = Object.fromEntries(Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length])); return { accepted: true, mode: "SAFE_IMPORT", version: snapshot.version, createdAt: snapshot.createdAt, tableCounts: counts, offlineOperations: Array.isArray(snapshot.offlineOperations) ? snapshot.offlineOperations.length : 0, message: "تم التحقق من النسخة؛ الاستعادة المحلية جاهزة للاستيراد. لم يتم حذف بيانات الخادم." }; }
