export type LegacyWindowContract = {
  forms: string[];
  domain: string;
  title: string;
  coreApi: string;
  modules: string[];
  actions: string[];
  capabilities: string[];
  sourceTables: string[];
  implementationStatus: "IMPLEMENTED" | "PARTIAL" | "REFERENCE_ONLY";
};

const commonActions = ["initialize", "query", "new", "validate", "save", "update", "delete", "print", "refresh", "exit"];

export const legacyWindowContracts: LegacyWindowContract[] = [
  {
    forms: ["GLSI001.fmx", "GLST001.fmx"], domain: "GL/FINANCE", title: "الحسابات العامة والقيود",
    coreApi: "ONEX_GL_WINDOW_API", modules: ["accounting-core", "period-close-core", "chart-of-accounts-core"],
    actions: [...commonActions, "approve", "post", "reverse", "close-period"],
    capabilities: ["دليل الحسابات", "قيود مزدوجة متوازنة", "فترات مالية", "تدقيق القيود"],
    sourceTables: ["ONEX_GL_ACCOUNT", "ONEX_GL_JOURNAL", "ONEX_GL_LINE", "ONEX_FISCAL_PERIOD", "ONEX_AUDIT_EVENT"], implementationStatus: "IMPLEMENTED",
  },
  {
    forms: ["ARST004.fmx", "ARSI004.fmx"], domain: "AR/ACCOUNTS-RECEIVABLE", title: "فواتير المبيعات والذمم",
    coreApi: "ONEX_AR_WINDOW_API", modules: ["commercial-invoice-core", "invoice-posting-core", "receivables-core"],
    actions: [...commonActions, "approve", "post", "reverse", "receive-payment"],
    capabilities: ["رأس وتفاصيل الفاتورة", "احتساب الضريبة", "ترحيل الذمم والإيراد", "حركة المخزون", "العكس المحاسبي"],
    sourceTables: ["ONEX_AR_DOC", "ONEX_AR_DOC_LINE", "ONEX_AR_DUE", "IAS_BILL_MST", "IAS_BILL_DTL"], implementationStatus: "IMPLEMENTED",
  },
  {
    forms: ["APSI003.fmx", "APST003.fmx"], domain: "AP/PURCHASING", title: "المشتريات والدائنون",
    coreApi: "ONEX_AP_WINDOW_API", modules: ["commercial-invoice-core", "business-operations-core"],
    actions: [...commonActions, "approve", "post", "reverse", "receive-stock", "pay-supplier"],
    capabilities: ["موردون", "فواتير شراء", "استلام مخزون", "دائنون"],
    sourceTables: ["ONEX_AP_DOC", "ONEX_AP_DOC_LINE", "IAS_BILL_MST", "IAS_BILL_DTL", "GR_DETAIL"], implementationStatus: "PARTIAL",
  },
  {
    forms: ["INVI001.fmx", "INVT001.fmx"], domain: "INVENTORY/STOCK", title: "المخزون والمستودعات",
    coreApi: "ONEX_INVENTORY_WINDOW_API", modules: ["business-operations-core", "inventory-costing-core"],
    actions: [...commonActions, "receive", "issue", "transfer", "adjust", "count"],
    capabilities: ["أرصدة الأصناف", "استلام وصرف", "حركات المستودع", "تقييم المخزون"],
    sourceTables: ["ONEX_ITEM", "ONEX_WAREHOUSE", "ITEM_MOVEMENT", "MASTER_INV", "ITEMS_COSTING"], implementationStatus: "PARTIAL",
  },
  {
    forms: ["POSI001.fmx", "POST001.fmx"], domain: "POS", title: "نقطة البيع",
    coreApi: "ONEX_POS_WINDOW_API", modules: ["commercial-invoice-core", "business-operations-core"],
    actions: [...commonActions, "open-shift", "close-shift", "post", "refund"],
    capabilities: ["بيع فوري", "طرق دفع", "إغلاق وردية", "مرتجع"],
    sourceTables: ["ONEX_POS_SHIFT", "ONEX_POS_SALE", "ONEX_POS_PAYMENT"], implementationStatus: "REFERENCE_ONLY",
  },
  {
    forms: ["GLSR001.fmx", "ARSR041.fmx", "MRPREP001.fmx"], domain: "REPORTS", title: "التقارير المالية والتشغيلية",
    coreApi: "ONEX_REPORT_WINDOW_API", modules: ["financial-reports-core"],
    actions: ["initialize", "query", "print", "export", "refresh", "exit"],
    capabilities: ["ملخص القيود", "سجل الفواتير", "تقييم المخزون"],
    sourceTables: ["ONEX_GL_JOURNAL", "ONEX_AR_DOC", "ONEX_ITEM_BALANCE"], implementationStatus: "IMPLEMENTED",
  },
];

export function getLegacyWindowContract(form: string): LegacyWindowContract | undefined {
  const normalized = form.replace(/\.fmx$/i, "").toUpperCase();
  return legacyWindowContracts.find((contract) => contract.forms.some((item) => item.replace(/\.fmx$/i, "").toUpperCase() === normalized));
}

export function getLegacyWindowContracts() { return legacyWindowContracts; }
