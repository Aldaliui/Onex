import type { LegacyField, LegacyWindowContract } from "./legacyContracts";

export type AdminLegacyWindow = {
  id: string;
  label: string;
  kind: "transaction" | "inquiry";
  category: "admin";
  rebuildLevel: "catalog_specification";
  verificationStatus: "CATALOG_ONLY";
  sourceStatus: "FMB_PLL_not_found";
  nextRequiredEvidence: string;
};

/**
 * Administrative legacy forms indexed in rebuild-manifest/all_windows_rebuild_status.csv.
 * They are deliberately exposed as catalog contracts until FMB/PLL/PKS/PKB/DDL evidence
 * is supplied; no Oracle trigger or destructive SQL is invented here.
 */
export const adminLegacyWindows: AdminLegacyWindow[] = [
  "ADMHRST005", "ADMHRST006", "ADMI001", "ADMI003", "ADMI004", "ADMI005",
  "ADMI006", "ADMI007", "ADMI008", "ADMI009", "ADMI010", "ADMI011",
  "ADMI012", "ADMI013", "ADMI014", "ADMI015", "ADMI016", "ADMI020",
  "ADMI021", "ADMINVI017", "ADMQ001", "ADMQ002", "ADMQ003", "ADMR010",
  "ADMR020", "ADMT020", "ADMT021", "ADMT022", "ADMT022ث", "ADMT023",
  "ADMT024", "ADMT025", "ADMT027", "ADMT028", "ADMT029", "ADMT030",
  "ADMT031",
].map((id) => ({
  id,
  label: `نافذة الإدارة ${id}`,
  kind: id.startsWith("ADMR") || id.startsWith("ADMQ") ? "inquiry" : "transaction",
  category: "admin",
  rebuildLevel: "catalog_specification",
  verificationStatus: "CATALOG_ONLY",
  sourceStatus: "FMB_PLL_not_found",
  nextRequiredEvidence: "FMB/PLL/PKS/PKB/DDL/Forms Builder",
}));

const inferredAdminFields: LegacyField[] = [
  { id: "COMPANY_CODE", label: "الشركة", type: "text", evidence: "inferred" },
  { id: "BRANCH_CODE", label: "الفرع", type: "text", evidence: "inferred" },
  { id: "USER_CODE", label: "المستخدم", type: "text", evidence: "inferred" },
  { id: "STATUS", label: "الحالة", type: "select", evidence: "inferred" },
];

/** Build a safe read/query contract for an indexed admin form. */
export function adminWindowContract(window: AdminLegacyWindow): LegacyWindowContract {
  return {
    id: window.id,
    label: window.label,
    module: "admin",
    kind: window.kind,
    formName: `${window.id}.fmx`,
    fields: inferredAdminFields,
    actions: ["query", "print", "cancel"],
    source: {
      form: `${window.id}.fmx`,
      namespace: "ADMIN/SYSTEM",
      libraries: [],
      tables: [],
      procedures: [],
    },
    notes: `حالة إعادة البناء: ${window.verificationStatus}. يلزم توفير ${window.nextRequiredEvidence} قبل تنفيذ الحفظ أو الحذف أو الترحيل.`,
  };
}

export const adminLegacyWindowById = new Map(adminLegacyWindows.map((window) => [window.id, window]));
