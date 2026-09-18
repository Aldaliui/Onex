import { useCallback, useEffect, useState } from "react";
import { enqueueOfflineOperation, flushOfflineOperations, getOfflineSnapshot, subscribeToConnectivity, type OfflineOperation, type SyncStatus } from "@/lib/offlineSync";

type OfflineState = { online: boolean; pending: number; failed: number; conflict: number; lastSyncAt?: string };
const initialState: OfflineState = { online: typeof navigator === "undefined" ? true : navigator.onLine, pending: 0, failed: 0, conflict: 0 };

export function useOfflineSync(executor?: (operation: OfflineOperation) => Promise<"SYNCED" | "CONFLICT">) {
  const [state, setState] = useState<OfflineState>(initialState);
  const refresh = useCallback(async () => { try { setState(await getOfflineSnapshot()); } catch { /* IndexedDB is unavailable in non-browser rendering. */ } }, []);
  const flush = useCallback(async () => { if (!executor) return refresh(); setState(await flushOfflineOperations(executor)); }, [executor, refresh]);
  const enqueue = useCallback(async (type: string, payload: unknown, requestId?: string) => { const operation = await enqueueOfflineOperation(type, payload, requestId); await refresh(); if (typeof navigator === "undefined" || navigator.onLine) void flush(); return operation; }, [flush, refresh]);
  useEffect(() => { void refresh(); const unsubscribe = subscribeToConnectivity(() => { void refresh(); if (navigator.onLine) void flush(); }); const timer = window.setInterval(() => { if (navigator.onLine) void flush(); }, 30000); return () => { unsubscribe(); window.clearInterval(timer); }; }, [flush, refresh]);
  return { ...state, refresh, flush, enqueue };
}

export function syncStatusLabel(state: Pick<OfflineState, "online" | "pending" | "failed" | "conflict">) { if (!state.online) return "بدون اتصال"; if (state.conflict) return `${state.conflict} تعارض`; if (state.failed) return `${state.failed} فشلت`; if (state.pending) return `${state.pending} بانتظار المزامنة`; return "متزامن"; }

export type { SyncStatus };
