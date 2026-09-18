export type SyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED" | "CONFLICT";

export type OfflineOperation = {
  requestId: string;
  type: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: SyncStatus;
  lastError?: string;
};

type OfflineSnapshot = { online: boolean; pending: number; failed: number; conflict: number; lastSyncAt?: string };

const DB_NAME = "onex-offline";
const DB_VERSION = 1;
const STORE = "operations";

function makeRequestId(type: string) { return `${type}:${Date.now()}:${crypto.randomUUID()}`; }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) { const store = db.createObjectStore(STORE, { keyPath: "requestId" }); store.createIndex("status", "status", { unique: false }); store.createIndex("createdAt", "createdAt", { unique: false }); } };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("OFFLINE_DB_OPEN_FAILED"));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => { const tx = db.transaction(STORE, mode); const store = tx.objectStore(STORE); action(store, resolve, reject); tx.oncomplete = () => db.close(); tx.onerror = () => reject(tx.error || new Error("OFFLINE_DB_TRANSACTION_FAILED")); });
}

export async function enqueueOfflineOperation(type: string, payload: unknown, requestId = makeRequestId(type)): Promise<OfflineOperation> {
  const now = new Date().toISOString();
  const operation: OfflineOperation = { requestId, type, payload, createdAt: now, updatedAt: now, attempts: 0, status: "PENDING" };
  return transaction("readwrite", (store, done, fail) => { const get = store.get(requestId); get.onsuccess = () => { if (get.result) return done(get.result as OfflineOperation); const put = store.add(operation); put.onsuccess = () => done(operation); put.onerror = () => fail(put.error || new Error("OFFLINE_OPERATION_CREATE_FAILED")); }; get.onerror = () => fail(get.error || new Error("OFFLINE_OPERATION_LOOKUP_FAILED")); });
}

export async function listOfflineOperations(): Promise<OfflineOperation[]> { return transaction("readonly", (store, done, fail) => { const request = store.getAll(); request.onsuccess = () => done((request.result as OfflineOperation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt))); request.onerror = () => fail(request.error); }); }

export async function updateOfflineOperation(requestId: string, patch: Partial<OfflineOperation>): Promise<void> { await transaction("readwrite", (store, done, fail) => { const request = store.get(requestId); request.onsuccess = () => { if (!request.result) return fail(new Error("OFFLINE_OPERATION_NOT_FOUND")); const put = store.put({ ...(request.result as OfflineOperation), ...patch, updatedAt: new Date().toISOString() }); put.onsuccess = () => done(undefined); put.onerror = () => fail(put.error); }; request.onerror = () => fail(request.error); }); }

export async function getOfflineSnapshot(): Promise<OfflineSnapshot> { const rows = await listOfflineOperations(); return { online: typeof navigator === "undefined" ? true : navigator.onLine, pending: rows.filter((row) => row.status === "PENDING" || row.status === "SYNCING").length, failed: rows.filter((row) => row.status === "FAILED").length, conflict: rows.filter((row) => row.status === "CONFLICT").length, lastSyncAt: rows.filter((row) => row.status === "SYNCED").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt }; }

export async function flushOfflineOperations(executor: (operation: OfflineOperation) => Promise<"SYNCED" | "CONFLICT">): Promise<OfflineSnapshot> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return getOfflineSnapshot();
  const rows = (await listOfflineOperations()).filter((row) => row.status === "PENDING" || row.status === "FAILED");
  for (const operation of rows) { await updateOfflineOperation(operation.requestId, { status: "SYNCING", attempts: operation.attempts + 1 }); try { const result = await executor({ ...operation, status: "SYNCING", attempts: operation.attempts + 1 }); await updateOfflineOperation(operation.requestId, { status: result }); } catch (error) { await updateOfflineOperation(operation.requestId, { status: "FAILED", lastError: error instanceof Error ? error.message : String(error) }); } }
  return getOfflineSnapshot();
}

export function subscribeToConnectivity(listener: () => void) { if (typeof window === "undefined") return () => undefined; window.addEventListener("online", listener); window.addEventListener("offline", listener); return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); }; }
