import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, index, unique } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().unique(),
  engine: varchar("engine", { length: 30 }).notNull().default("mysql"),
  host: varchar("host", { length: 255 }),
  port: int("port").default(3306),
  databaseName: varchar("databaseName", { length: 160 }),
  ssl: int("ssl").notNull().default(1),
  updatedBy: varchar("updatedBy", { length: 100 }).notNull().default("system"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const windowRegistry = mysqlTable("window_registry", {
  id: int("id").autoincrement().primaryKey(),
  screenNo: varchar("screenNo", { length: 40 }).notNull().default("SYS-0000"),
  screenName: varchar("screenName", { length: 240 }).notNull().default("Legacy Window"),
  parentId: varchar("parentId", { length: 160 }),
  systemNo: varchar("systemNo", { length: 40 }).notNull().default("ONEX"),
  itemType: varchar("itemType", { length: 40 }).notNull().default("FORM"),
  formName: varchar("formName", { length: 160 }).notNull().default("LEGACY.fmx"),
  displayOrder: int("displayOrder").notNull().default(0),
  userPermission: varchar("userPermission", { length: 120 }).notNull().default("ROLE_USER"),
  companyBranchPermission: varchar("companyBranchPermission", { length: 160 }).notNull().default("COMPANY_BRANCH_SCOPE"),
  buildState: varchar("buildState", { length: 40 }).notNull().default("INDEXED"),
  compiledSize: int("compiledSize").notNull().default(0),
  rebuildLevel: varchar("rebuildLevel", { length: 60 }).notNull().default("catalog_specification"),
  sourceStatus: varchar("sourceStatus", { length: 80 }).notNull().default("FMB_PLL_not_found"),
  observedProcedures: int("observedProcedures").notNull().default(0),
  observedTriggers: int("observedTriggers").notNull().default(0),
  observedLibraries: int("observedLibraries").notNull().default(0),
  observedTableIndicators: int("observedTableIndicators").notNull().default(0),
  riskFlags: text("riskFlags"),
  specPath: varchar("specPath", { length: 240 }),
  nextRequiredEvidence: varchar("nextRequiredEvidence", { length: 240 }),
  legacyForm: varchar("legacyForm", { length: 160 }).notNull().unique(),
  domainCode: varchar("domainCode", { length: 40 }).notNull(),
  capability: varchar("capability", { length: 100 }).notNull(),
  migrationPhase: int("migrationPhase").notNull().default(3),
  status: mysqlEnum("status", ["cataloged", "spec_only", "in_progress", "verified"]).notNull().default("cataloged"),
  sourceConfidence: varchar("sourceConfidence", { length: 40 }).notNull().default("FMX_STRING_EVIDENCE"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ domainIdx: index("window_registry_domain_idx").on(table.domainCode) }));

export const windowContracts = mysqlTable("window_contracts", {
  id: int("id").autoincrement().primaryKey(),
  legacyForm: varchar("legacyForm", { length: 160 }).notNull().unique(),
  domainCode: varchar("domainCode", { length: 80 }).notNull(),
  coreApi: varchar("coreApi", { length: 160 }).notNull(),
  actionsJson: text("actionsJson").notNull(),
  evidenceJson: text("evidenceJson").notNull(),
  rebuildLevel: varchar("rebuildLevel", { length: 60 }).notNull().default("catalog_specification"),
  verificationStatus: varchar("verificationStatus", { length: 60 }).notNull().default("CATALOG_ONLY"),
  active: int("active").notNull().default(1),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ domainIdx: index("window_contract_domain_idx").on(table.domainCode) }));

export const windowExecutions = mysqlTable("window_executions", {
  id: int("id").autoincrement().primaryKey(),
  legacyForm: varchar("legacyForm", { length: 160 }).notNull(),
  actionCode: varchar("actionCode", { length: 80 }).notNull(),
  invoiceId: int("invoiceId"),
  requestId: varchar("requestId", { length: 160 }).notNull().unique(),
  actor: varchar("actor", { length: 100 }).notNull(),
  mode: varchar("mode", { length: 40 }).notNull().default("DATABASE_CONTRACT"),
  status: varchar("status", { length: 40 }).notNull(),
  responseJson: text("responseJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ windowActionIdx: index("window_execution_action_idx").on(table.legacyForm, table.actionCode, table.createdAt) }));

export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  baseCurrency: varchar("baseCurrency", { length: 3 }).notNull().default("SAR"),
});

export const warehouses = mysqlTable("warehouses", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  active: int("active").notNull().default(1),
}, (table) => ({ companyCode: unique("warehouse_company_code").on(table.companyId, table.code) }));

export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  accountId: int("accountId"),
  code: varchar("code", { length: 50 }).notNull(),
  legalName: varchar("legalName", { length: 250 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  status: mysqlEnum("status", ["ACTIVE", "BLOCKED", "CLOSED"]).notNull().default("ACTIVE"),
}, (table) => ({ companyCode: unique("customer_company_code").on(table.companyId, table.code) }));

export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  accountId: int("accountId"),
  code: varchar("code", { length: 50 }).notNull(),
  legalName: varchar("legalName", { length: 250 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  status: mysqlEnum("status", ["ACTIVE", "BLOCKED", "CLOSED"]).notNull().default("ACTIVE"),
}, (table) => ({ companyCode: unique("supplier_company_code").on(table.companyId, table.code) }));

export const cashBoxes = mysqlTable("cash_boxes", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  accountId: int("accountId"),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 250 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  status: mysqlEnum("status", ["ACTIVE", "BLOCKED", "CLOSED"]).notNull().default("ACTIVE"),
}, (table) => ({ companyCode: unique("cash_box_company_code").on(table.companyId, table.code) }));

export const banks = mysqlTable("banks", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  accountId: int("accountId"),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 250 }).notNull(),
  accountNumber: varchar("accountNumber", { length: 100 }),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  status: mysqlEnum("status", ["ACTIVE", "BLOCKED", "CLOSED"]).notNull().default("ACTIVE"),
}, (table) => ({ companyCode: unique("bank_company_code").on(table.companyId, table.code) }));

export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  code: varchar("code", { length: 80 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  stockFlag: int("stockFlag").notNull().default(1),
  unitCost: decimal("unitCost", { precision: 20, scale: 6 }).notNull().default("0"),
  revenueAccount: varchar("revenueAccount", { length: 80 }).notNull().default("4100"),
  inventoryAccount: varchar("inventoryAccount", { length: 80 }).notNull().default("1300"),
  cogsAccount: varchar("cogsAccount", { length: 80 }).notNull().default("5100"),
  active: int("active").notNull().default(1),
}, (table) => ({ companyCode: unique("item_company_code").on(table.companyId, table.code) }));

export const stockBalances = mysqlTable("stock_balances", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull().default("0"),
  reservedQuantity: decimal("reservedQuantity", { precision: 20, scale: 6 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 20, scale: 6 }).notNull().default("0"),
  totalCost: decimal("totalCost", { precision: 20, scale: 6 }).notNull().default("0"),
  versionNo: int("versionNo").notNull().default(1),
}, (table) => ({ itemWarehouse: unique("stock_item_warehouse").on(table.itemId, table.warehouseId) }));

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  docNo: varchar("docNo", { length: 80 }).notNull().unique(),
  invoiceType: mysqlEnum("invoiceType", ["SALE", "PURCHASE"]).notNull().default("SALE"),
  customerId: int("customerId"),
  supplierId: int("supplierId"),
  warehouseId: int("warehouseId").notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  exchangeRate: decimal("exchangeRate", { precision: 20, scale: 8 }).notNull().default("1"),
  subtotal: decimal("subtotal", { precision: 20, scale: 6 }).notNull().default("0"),
  taxTotal: decimal("taxTotal", { precision: 20, scale: 6 }).notNull().default("0"),
  grandTotal: decimal("grandTotal", { precision: 20, scale: 6 }).notNull().default("0"),
  status: mysqlEnum("status", ["DRAFT", "POSTED", "REVERSED"]).notNull().default("DRAFT"),
  paymentMethod: varchar("paymentMethod", { length: 24 }).notNull().default("CASH"),
  paidAmount: decimal("paidAmount", { precision: 20, scale: 6 }).notNull().default("0"),
  remainingAmount: decimal("remainingAmount", { precision: 20, scale: 6 }).notNull().default("0"),
  paymentReference: varchar("paymentReference", { length: 160 }),
  autoVoucherId: int("autoVoucherId"),
  notes: text("notes"),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  sourceForm: varchar("sourceForm", { length: 80 }).notNull().default("ARST004"),
  purchaseOrderId: int("purchaseOrderId"),
  goodsReceiptId: int("goodsReceiptId"),
  createdBy: varchar("createdBy", { length: 100 }).notNull().default("demo.user"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  postedAt: timestamp("postedAt"),
}, (table) => ({ statusIdx: index("invoice_status_idx").on(table.status) }));

export const invoiceLines = mysqlTable("invoice_lines", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 20, scale: 6 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 20, scale: 6 }).notNull().default("0"),
  lineTotal: decimal("lineTotal", { precision: 20, scale: 6 }).notNull(),
  unitCode: varchar("unitCode", { length: 30 }).notNull().default("EA"),
  batchNo: varchar("batchNo", { length: 100 }),
  expireDate: timestamp("expireDate"),
  locationId: int("locationId"),
  serialsJson: text("serialsJson"),
});

export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNo: varchar("orderNo", { length: 80 }).notNull().unique(),
  supplierId: int("supplierId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  subtotal: decimal("subtotal", { precision: 20, scale: 6 }).notNull().default("0"),
  taxTotal: decimal("taxTotal", { precision: 20, scale: 6 }).notNull().default("0"),
  grandTotal: decimal("grandTotal", { precision: 20, scale: 6 }).notNull().default("0"),
  status: mysqlEnum("status", ["DRAFT", "VALIDATED", "APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "CLOSED", "CANCELLED"]).notNull().default("DRAFT"),
  actor: varchar("actor", { length: 100 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  approvedAt: timestamp("approvedAt"),
  closedAt: timestamp("closedAt"),
}, (table) => ({ supplierStatusIdx: index("purchase_order_supplier_status_idx").on(table.supplierId, table.status) }));

export const purchaseOrderLines = mysqlTable("purchase_order_lines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull(),
  receivedQuantity: decimal("receivedQuantity", { precision: 20, scale: 6 }).notNull().default("0"),
  unitPrice: decimal("unitPrice", { precision: 20, scale: 6 }).notNull(),
  taxAmount: decimal("taxAmount", { precision: 20, scale: 6 }).notNull().default("0"),
  lineTotal: decimal("lineTotal", { precision: 20, scale: 6 }).notNull(),
});

export const goodsReceipts = mysqlTable("goods_receipts", {
  id: int("id").autoincrement().primaryKey(),
  receiptNo: varchar("receiptNo", { length: 80 }).notNull().unique(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  supplierId: int("supplierId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  status: mysqlEnum("status", ["DRAFT", "VALIDATED", "POSTED", "CANCELLED"]).notNull().default("DRAFT"),
  actor: varchar("actor", { length: 100 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  postedAt: timestamp("postedAt"),
});

export const goodsReceiptLines = mysqlTable("goods_receipt_lines", {
  id: int("id").autoincrement().primaryKey(),
  goodsReceiptId: int("goodsReceiptId").notNull(),
  purchaseOrderLineId: int("purchaseOrderLineId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull(),
  unitCost: decimal("unitCost", { precision: 20, scale: 6 }).notNull(),
  batchNo: varchar("batchNo", { length: 100 }),
  expireDate: timestamp("expireDate"),
  serialsJson: text("serialsJson"),
});

export const grniPostings = mysqlTable("grni_postings", {
  id: int("id").autoincrement().primaryKey(),
  goodsReceiptId: int("goodsReceiptId").notNull().unique(),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  supplierId: int("supplierId").notNull(),
  journalId: int("journalId"),
  amount: decimal("amount", { precision: 20, scale: 6 }).notNull(),
  status: mysqlEnum("status", ["OPEN", "SETTLED", "CANCELLED"]).notNull().default("OPEN"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  settledAt: timestamp("settledAt"),
}, (table) => ({ supplierStatusIdx: index("grni_supplier_status_idx").on(table.supplierId, table.status) }));

export const eInvoiceSubmissions = mysqlTable("e_invoice_submissions", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  provider: varchar("provider", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["QUEUED", "SUBMITTED", "ACCEPTED", "REJECTED", "FAILED"]).notNull().default("QUEUED"),
  externalId: varchar("externalId", { length: 160 }),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  payloadJson: text("payloadJson").notNull(),
  responseJson: text("responseJson"),
  errorCode: varchar("errorCode", { length: 80 }),
  errorMessage: varchar("errorMessage", { length: 500 }),
  submittedAt: timestamp("submittedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ invoiceIdx: index("e_invoice_submission_invoice_idx").on(table.invoiceId), statusIdx: index("e_invoice_submission_status_idx").on(table.status) }));

export const adjustmentNotes = mysqlTable("adjustment_notes", {
  id: int("id").autoincrement().primaryKey(),
  docNo: varchar("docNo", { length: 80 }).notNull().unique(),
  documentKind: mysqlEnum("documentKind", ["SALES_RETURN", "PURCHASE_RETURN", "SALES_DISCOUNT", "SALES_ADDITION", "PURCHASE_DISCOUNT", "PURCHASE_ADDITION"]).notNull(),
  originalInvoiceId: int("originalInvoiceId").notNull(), customerId: int("customerId"), supplierId: int("supplierId"), warehouseId: int("warehouseId").notNull(),
  subtotal: decimal("subtotal", { precision: 20, scale: 6 }).notNull().default("0"), taxTotal: decimal("taxTotal", { precision: 20, scale: 6 }).notNull().default("0"), grandTotal: decimal("grandTotal", { precision: 20, scale: 6 }).notNull().default("0"),
  reason: varchar("reason", { length: 500 }), status: mysqlEnum("status", ["DRAFT", "POSTED", "REVERSED"]).notNull().default("DRAFT"),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(), createdBy: varchar("createdBy", { length: 100 }).notNull().default("demo.user"), createdAt: timestamp("createdAt").defaultNow().notNull(), postedAt: timestamp("postedAt"),
}, (table) => ({ originalIdx: index("adjustment_original_idx").on(table.originalInvoiceId), kindIdx: index("adjustment_kind_idx").on(table.documentKind) }));

export const adjustmentNoteLines = mysqlTable("adjustment_note_lines", {
  id: int("id").autoincrement().primaryKey(), adjustmentNoteId: int("adjustmentNoteId").notNull(), itemId: int("itemId").notNull(), quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull(), unitPrice: decimal("unitPrice", { precision: 20, scale: 6 }).notNull(), taxAmount: decimal("taxAmount", { precision: 20, scale: 6 }).notNull().default("0"), lineTotal: decimal("lineTotal", { precision: 20, scale: 6 }).notNull(),
});

export const inventoryCounts = mysqlTable("inventory_counts", {
  id: int("id").autoincrement().primaryKey(),
  countNo: varchar("countNo", { length: 80 }).notNull().unique(),
  warehouseId: int("warehouseId").notNull(),
  countMode: mysqlEnum("countMode", ["PERIODIC", "CYCLE"]).notNull().default("PERIODIC"),
  status: mysqlEnum("status", ["DRAFT", "POSTED", "CANCELLED"]).notNull().default("DRAFT"),
  countedAt: timestamp("countedAt").defaultNow().notNull(),
  postedAt: timestamp("postedAt"),
  actor: varchar("actor", { length: 100 }).notNull().default("demo.user"),
  notes: text("notes"),
});

export const inventoryCountLines = mysqlTable("inventory_count_lines", {
  id: int("id").autoincrement().primaryKey(),
  countId: int("countId").notNull(),
  itemId: int("itemId").notNull(),
  systemQuantity: decimal("systemQuantity", { precision: 20, scale: 6 }).notNull().default("0"),
  countedQuantity: decimal("countedQuantity", { precision: 20, scale: 6 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 20, scale: 6 }).notNull().default("0"),
  varianceQuantity: decimal("varianceQuantity", { precision: 20, scale: 6 }).notNull().default("0"),
  varianceValue: decimal("varianceValue", { precision: 20, scale: 6 }).notNull().default("0"),
});

export const stockMovements = mysqlTable("stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  sourceInvoiceId: int("sourceInvoiceId"),
  movementType: varchar("movementType", { length: 40 }).notNull(),
  quantityIn: decimal("quantityIn", { precision: 20, scale: 6 }).notNull().default("0"),
  quantityOut: decimal("quantityOut", { precision: 20, scale: 6 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 20, scale: 6 }).notNull().default("0"),
  totalCost: decimal("totalCost", { precision: 20, scale: 6 }).notNull().default("0"),
  balanceAfter: decimal("balanceAfter", { precision: 20, scale: 6 }).notNull().default("0"),
  createdBy: varchar("createdBy", { length: 100 }).notNull().default("demo.user"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const stockLocationBalances = mysqlTable("stock_location_balances", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  locationId: int("locationId").notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull().default("0"),
  totalCost: decimal("totalCost", { precision: 20, scale: 6 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 20, scale: 6 }).notNull().default("0"),
  versionNo: int("versionNo").notNull().default(1),
}, (table) => ({ itemWarehouseLocation: unique("stock_item_warehouse_location").on(table.itemId, table.warehouseId, table.locationId) }));

export const journalEntries = mysqlTable("journal_entries", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().default(1),
  branchId: int("branchId"),
  fiscalPeriodId: int("fiscalPeriodId"),
  journalNo: varchar("journalNo", { length: 80 }).notNull().unique(),
  sourceInvoiceId: int("sourceInvoiceId"),
  sourceType: varchar("sourceType", { length: 40 }).notNull().default("MANUAL"),
  sourceDocumentNo: varchar("sourceDocumentNo", { length: 80 }),
  entryType: varchar("entryType", { length: 40 }).notNull(),
  journalDate: timestamp("journalDate").defaultNow().notNull(),
  description: text("description"),
  totalDebit: decimal("totalDebit", { precision: 20, scale: 6 }).notNull(),
  totalCredit: decimal("totalCredit", { precision: 20, scale: 6 }).notNull(),
  status: mysqlEnum("status", ["DRAFT", "VALIDATED", "APPROVED", "POSTED", "REVERSED", "CANCELLED"]).notNull().default("DRAFT"),
  validatedAt: timestamp("validatedAt"),
  validatedBy: varchar("validatedBy", { length: 100 }),
  approvedAt: timestamp("approvedAt"),
  approvedBy: varchar("approvedBy", { length: 100 }),
  postedAt: timestamp("postedAt"),
  reversedAt: timestamp("reversedAt"),
  reversedBy: varchar("reversedBy", { length: 100 }),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  createdBy: varchar("createdBy", { length: 100 }).notNull().default("system"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyDateIdx: index("journal_company_date_idx").on(table.companyId, table.journalDate),
  periodStatusIdx: index("journal_period_status_idx").on(table.fiscalPeriodId, table.status),
  sourceIdx: index("journal_source_idx").on(table.sourceType, table.sourceDocumentNo),
}));

export const journalEntryLines = mysqlTable("journal_entry_lines", {
  id: int("id").autoincrement().primaryKey(),
  journalEntryId: int("journalEntryId").notNull(),
  lineNo: int("lineNo").notNull().default(1),
  accountCode: varchar("accountCode", { length: 80 }).notNull(),
  accountName: varchar("accountName", { length: 240 }),
  description: varchar("description", { length: 500 }),
  costCenterCode: varchar("costCenterCode", { length: 80 }),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  exchangeRate: decimal("exchangeRate", { precision: 20, scale: 8 }).notNull().default("1"),
  debit: decimal("debit", { precision: 20, scale: 6 }).notNull().default("0"),
  credit: decimal("credit", { precision: 20, scale: 6 }).notNull().default("0"),
  baseDebit: decimal("baseDebit", { precision: 20, scale: 6 }).notNull().default("0"),
  baseCredit: decimal("baseCredit", { precision: 20, scale: 6 }).notNull().default("0"),
}, (table) => ({
  journalLineIdx: index("journal_line_journal_idx").on(table.journalEntryId, table.lineNo),
  accountLineIdx: index("journal_line_account_idx").on(table.accountCode),
}));

export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  actor: varchar("actor", { length: 100 }).notNull(),
  actionCode: varchar("actionCode", { length: 80 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 120 }).notNull(),
  requestId: varchar("requestId", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  code: varchar("code", { length: 30 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  active: int("active").notNull().default(1),
}, (table) => ({ companyCode: unique("branch_company_code").on(table.companyId, table.code) }));

export const roles = mysqlTable("roles", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  active: int("active").notNull().default(1),
});

export const permissions = mysqlTable("permissions", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 120 }).notNull().unique(),
  windowCode: varchar("windowCode", { length: 160 }),
  actionCode: varchar("actionCode", { length: 80 }).notNull(),
  description: varchar("description", { length: 300 }),
});

export const userRoles = mysqlTable("user_roles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  roleId: int("roleId").notNull(),
  branchId: int("branchId"),
}, (table) => ({ assignment: unique("user_role_branch").on(table.userId, table.roleId, table.branchId) }));

export const rolePermissions = mysqlTable("role_permissions", {
  id: int("id").autoincrement().primaryKey(),
  roleId: int("roleId").notNull(),
  permissionId: int("permissionId").notNull(),
}, (table) => ({ assignment: unique("role_permission").on(table.roleId, table.permissionId) }));

export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  code: varchar("code", { length: 80 }).notNull(),
  name: varchar("name", { length: 240 }).notNull(),
  accountType: varchar("accountType", { length: 30 }).notNull(),
  parentCode: varchar("parentCode", { length: 80 }),
  levelNo: int("levelNo").notNull().default(0),
  allowPosting: int("allowPosting").notNull().default(1),
  normalBalance: mysqlEnum("normalBalance", ["DEBIT", "CREDIT"]).notNull().default("DEBIT"),
  isControlAccount: int("isControlAccount").notNull().default(0),
  cashFlowCategory: varchar("cashFlowCategory", { length: 40 }),
  salesAccount: int("salesAccount").notNull().default(0),
  purchaseAccount: int("purchaseAccount").notNull().default(0),
  inventoryAccount: int("inventoryAccount").notNull().default(0),
  cogsAccount: int("cogsAccount").notNull().default(0),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  active: int("active").notNull().default(1),
  status: mysqlEnum("status", ["ACTIVE", "BLOCKED", "CLOSED"]).notNull().default("ACTIVE"),
  legacyCode: varchar("legacyCode", { length: 80 }),
  legacySource: varchar("legacySource", { length: 120 }),
  closedAt: timestamp("closedAt"),
  closedBy: varchar("closedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  companyCode: unique("account_company_code").on(table.companyId, table.code),
  companyParentIdx: index("account_company_parent_idx").on(table.companyId, table.parentCode),
  typeActiveIdx: index("account_type_active_idx").on(table.companyId, table.accountType, table.active),
  postingIdx: index("account_posting_idx").on(table.companyId, table.allowPosting, table.active),
}));

export const fiscalPeriods = mysqlTable("fiscal_periods", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  code: varchar("code", { length: 30 }).notNull(),
  startsOn: timestamp("startsOn").notNull(),
  endsOn: timestamp("endsOn").notNull(),
  status: mysqlEnum("status", ["OPEN", "CLOSED"]).notNull().default("OPEN"),
}, (table) => ({ companyCode: unique("period_company_code").on(table.companyId, table.code) }));

export const fiscalPeriodClosures = mysqlTable("fiscal_period_closures", {
  id: int("id").autoincrement().primaryKey(),
  periodId: int("periodId").notNull().unique(),
  companyId: int("companyId").notNull(),
  status: mysqlEnum("status", ["STARTED", "COMPLETED", "REOPENED"]).notNull().default("STARTED"),
  checklistJson: text("checklistJson").notNull(),
  closingJournalId: int("closingJournalId"),
  actor: varchar("actor", { length: 100 }).notNull(),
  requestId: varchar("requestId", { length: 160 }).notNull().unique(),
  closedAt: timestamp("closedAt"),
  reopenedAt: timestamp("reopenedAt"),
  reopenedBy: varchar("reopenedBy", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type WindowRegistry = typeof windowRegistry.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type FiscalPeriod = typeof fiscalPeriods.$inferSelect;

export const documentSequences = mysqlTable("document_sequences", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  branchId: int("branchId"),
  periodId: int("periodId"),
  documentType: varchar("documentType", { length: 40 }).notNull(),
  prefix: varchar("prefix", { length: 30 }).notNull().default(""),
  nextNumber: int("nextNumber").notNull().default(1),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ scope: unique("document_sequence_scope").on(table.companyId, table.branchId, table.periodId, table.documentType) }));

export const documentEvents = mysqlTable("document_events", {
  id: int("id").autoincrement().primaryKey(),
  documentType: varchar("documentType", { length: 40 }).notNull(),
  documentId: int("documentId").notNull(),
  fromState: varchar("fromState", { length: 20 }),
  toState: varchar("toState", { length: 20 }).notNull(),
  actor: varchar("actor", { length: 100 }).notNull(),
  reason: varchar("reason", { length: 500 }),
  requestId: varchar("requestId", { length: 160 }).notNull().unique(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, (table) => ({ documentIdx: index("document_events_document_idx").on(table.documentType, table.documentId, table.occurredAt) }));

export const postingBatches = mysqlTable("posting_batches", {
  id: int("id").autoincrement().primaryKey(),
  documentType: varchar("documentType", { length: 40 }).notNull(),
  documentId: int("documentId").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 200 }).notNull().unique(),
  status: mysqlEnum("status", ["STARTED", "COMPLETED", "FAILED"]).notNull().default("STARTED"),
  actor: varchar("actor", { length: 100 }).notNull(),
  errorCode: varchar("errorCode", { length: 100 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ({ documentIdx: index("posting_batches_document_idx").on(table.documentType, table.documentId, table.status) }));

export const postingLines = mysqlTable("posting_lines", {
  id: int("id").autoincrement().primaryKey(),
  postingBatchId: int("postingBatchId").notNull(),
  documentLineId: int("documentLineId"),
  effectType: varchar("effectType", { length: 30 }).notNull(),
  sourceTable: varchar("sourceTable", { length: 80 }).notNull(),
  sourceId: int("sourceId").notNull(),
  amount: decimal("amount", { precision: 20, scale: 6 }).notNull().default("0"),
  quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull().default("0"),
});

export const outboxEvents = mysqlTable("outbox_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  aggregateType: varchar("aggregateType", { length: 40 }).notNull(),
  aggregateId: int("aggregateId").notNull(),
  payload: text("payload").notNull(),
  status: mysqlEnum("status", ["PENDING", "PUBLISHED", "FAILED"]).notNull().default("PENDING"),
  attempts: int("attempts").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  publishedAt: timestamp("publishedAt"),
}, (table) => ({ pendingIdx: index("outbox_pending_idx").on(table.status, table.createdAt) }));

export const receiptVouchers = mysqlTable("receipt_vouchers", {
  id: int("id").autoincrement().primaryKey(),
  voucherNo: varchar("voucherNo", { length: 80 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  customerId: int("customerId").notNull(),
  cashAccountCode: varchar("cashAccountCode", { length: 80 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  amount: decimal("amount", { precision: 20, scale: 6 }).notNull(),
  status: mysqlEnum("status", ["DRAFT", "POSTED", "REVERSED"]).notNull().default("DRAFT"),
  idempotencyKey: varchar("idempotencyKey", { length: 200 }).notNull().unique(),
  reference: varchar("reference", { length: 160 }),
  actor: varchar("actor", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  postedAt: timestamp("postedAt"),
});

export const receiptAllocations = mysqlTable("receipt_allocations", {
  id: int("id").autoincrement().primaryKey(),
  receiptId: int("receiptId").notNull(),
  invoiceId: int("invoiceId").notNull(),
  amount: decimal("amount", { precision: 20, scale: 6 }).notNull(),
}, (table) => ({ receiptInvoice: unique("receipt_invoice_allocation").on(table.receiptId, table.invoiceId) }));

export const paymentVouchers = mysqlTable("payment_vouchers", {
  id: int("id").autoincrement().primaryKey(),
  voucherNo: varchar("voucherNo", { length: 80 }).notNull().unique(),
  companyId: int("companyId").notNull(),
  supplierId: int("supplierId").notNull(),
  cashAccountCode: varchar("cashAccountCode", { length: 80 }).notNull(),
  currencyCode: varchar("currencyCode", { length: 3 }).notNull().default("SAR"),
  amount: decimal("amount", { precision: 20, scale: 6 }).notNull(),
  status: mysqlEnum("status", ["DRAFT", "POSTED", "REVERSED"]).notNull().default("DRAFT"),
  idempotencyKey: varchar("idempotencyKey", { length: 200 }).notNull().unique(),
  reference: varchar("reference", { length: 160 }),
  actor: varchar("actor", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  postedAt: timestamp("postedAt"),
});

export const paymentAllocations = mysqlTable("payment_allocations", {
  id: int("id").autoincrement().primaryKey(),
  paymentId: int("paymentId").notNull(),
  invoiceId: int("invoiceId").notNull(),
  amount: decimal("amount", { precision: 20, scale: 6 }).notNull(),
}, (table) => ({ paymentInvoice: unique("payment_invoice_allocation").on(table.paymentId, table.invoiceId) }));

export const itemUnits = mysqlTable("item_units", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  unitCode: varchar("unitCode", { length: 30 }).notNull(),
  unitName: varchar("unitName", { length: 100 }).notNull(),
  conversionToBase: decimal("conversionToBase", { precision: 20, scale: 6 }).notNull().default("1"),
  isBase: int("isBase").notNull().default(0),
  barcode: varchar("barcode", { length: 100 }),
  active: int("active").notNull().default(1),
}, (table) => ({ itemUnit: unique("item_unit_code").on(table.itemId, table.unitCode) }));

export const warehouseLocations = mysqlTable("warehouse_locations", {
  id: int("id").autoincrement().primaryKey(),
  warehouseId: int("warehouseId").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  active: int("active").notNull().default(1),
}, (table) => ({ warehouseLocation: unique("warehouse_location_code").on(table.warehouseId, table.code) }));

export const inventorySettings = mysqlTable("inventory_settings", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().unique(),
  costingType: varchar("costingType", { length: 30 }).notNull().default("MOVING_AVERAGE"),
  allowNegativeStock: int("allowNegativeStock").notNull().default(0),
  useBatchNo: int("useBatchNo").notNull().default(0),
  useExpireDate: int("useExpireDate").notNull().default(0),
  useSerialNo: int("useSerialNo").notNull().default(0),
});

export const inventoryBatches = mysqlTable("inventory_batches", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  batchNo: varchar("batchNo", { length: 100 }).notNull(),
  expireDate: timestamp("expireDate"),
  quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull().default("0"),
  unitCost: decimal("unitCost", { precision: 20, scale: 6 }).notNull().default("0"),
}, (table) => ({ batchScope: unique("inventory_batch_scope").on(table.itemId, table.warehouseId, table.batchNo) }));

export const inventorySerials = mysqlTable("inventory_serials", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  warehouseId: int("warehouseId").notNull(),
  serialNo: varchar("serialNo", { length: 160 }).notNull(),
  status: mysqlEnum("status", ["AVAILABLE", "SOLD", "DAMAGED", "TRANSFERRED"]).notNull().default("AVAILABLE"),
}, (table) => ({ serialUnique: unique("inventory_serial_unique").on(table.itemId, table.serialNo) }));

export const inventoryTransfers = mysqlTable("inventory_transfers", {
  id: int("id").autoincrement().primaryKey(),
  transferNo: varchar("transferNo", { length: 80 }).notNull().unique(),
  sourceWarehouseId: int("sourceWarehouseId").notNull(),
  destinationWarehouseId: int("destinationWarehouseId").notNull(),
  status: mysqlEnum("status", ["DRAFT", "POSTED", "CANCELLED"]).notNull().default("DRAFT"),
  actor: varchar("actor", { length: 100 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  postedAt: timestamp("postedAt"),
});

export const inventoryTransferLines = mysqlTable("inventory_transfer_lines", {
  id: int("id").autoincrement().primaryKey(),
  transferId: int("transferId").notNull(),
  itemId: int("itemId").notNull(),
  quantity: decimal("quantity", { precision: 20, scale: 6 }).notNull(),
  unitCost: decimal("unitCost", { precision: 20, scale: 6 }).notNull().default("0"),
});
