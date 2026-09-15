const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const ORIGIN = "https://onexdash-oyedvqsk.manus.space";
const ALLOWED_METHODS = "GET,POST,PATCH,OPTIONS";
const MAX_LIMIT = 100;

function responseHeaders(request) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = new Set([
    "https://onex-workbench.raghabatstore.workers.dev",
    "https://onexdash-oyedvqsk.manus.space",
  ]);
  const headers = { ...JSON_HEADERS, "access-control-allow-methods": ALLOWED_METHODS, "access-control-allow-headers": "content-type, authorization" };
  if (origin && allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
    headers.vary = "Origin";
  }
  return headers;
}

function json(data, status, request, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status: status ?? 200,
    headers: { ...responseHeaders(request), ...extraHeaders },
  });
}

function errorResponse(code, status, request, details) {
  return json({ error: code, ...(details ? { details } : {}) }, status, request);
}

async function proxyWorkbench(request) {
  const incoming = new URL(request.url);
  const origin = new URL(ORIGIN);
  origin.pathname = incoming.pathname;
  origin.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.set("x-onex-cloudflare-preview", "onex-workbench");
  const proxied = new Request(origin, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "follow" });
  const response = await fetch(proxied);
  const output = new Response(response.body, response);
  output.headers.set("x-onex-deployment", "cloudflare-worker");
  output.headers.set("x-onex-d1-binding", "ONEX_DB");
  output.headers.set("x-content-type-options", "nosniff");
  output.headers.set("x-frame-options", "DENY");
  output.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  return output;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function requireWriteAuth(request, env) {
  const expected = env.ONEX_API_TOKEN;
  const authorization = request.headers.get("authorization") || "";
  if (!expected) throw new Response(JSON.stringify({ error: "WRITE_AUTH_NOT_CONFIGURED" }), { status: 503, headers: JSON_HEADERS });
  if (!authorization.startsWith("Bearer ") || authorization.slice(7) !== expected) {
    throw new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: JSON_HEADERS });
  }
}

function boundedLimit(url, fallback = 20) {
  const requested = Number(url.searchParams.get("limit") || fallback);
  if (!Number.isInteger(requested)) return fallback;
  return Math.min(Math.max(requested, 1), MAX_LIMIT);
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function decimal(value, { min = 0, allowZero = true } = {}) {
  const parsed = typeof value === "number" ? value : Number(String(value));
  if (!Number.isFinite(parsed)) return null;
  if (allowZero ? parsed < min : parsed <= min) return null;
  return parsed;
}

async function health(env, request) {
  const result = await env.ONEX_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return json({ ok: true, service: "onex-workbench", storage: "cloudflare-d1", database: "onex-production", tables: result.results?.map((row) => row.name) ?? [] }, 200, request);
}

async function masterData(env, request) {
  const [companies, customers, suppliers, items, warehouses, currencies] = await env.ONEX_DB.batch([
    env.ONEX_DB.prepare("SELECT id, code, name, baseCurrency FROM companies ORDER BY id LIMIT 20"),
    env.ONEX_DB.prepare("SELECT id, companyId, code, legalName, currencyCode, status FROM customers ORDER BY code LIMIT 100"),
    env.ONEX_DB.prepare("SELECT id, companyId, code, legalName, currencyCode, status FROM suppliers ORDER BY code LIMIT 100"),
    env.ONEX_DB.prepare("SELECT id, companyId, code, COALESCE(NULLIF(description, ''), name) AS description, stockFlag, unitCost, revenueAccount, inventoryAccount, cogsAccount, active FROM items ORDER BY code LIMIT 100"),
    env.ONEX_DB.prepare("SELECT id, companyId, code, name, active FROM warehouses ORDER BY code LIMIT 50"),
    env.ONEX_DB.prepare("SELECT code, name, decimalScale, active FROM currencies WHERE active = 1 ORDER BY code"),
  ]);
  return json({ companies: companies.results ?? [], customers: customers.results ?? [], suppliers: suppliers.results ?? [], items: items.results ?? [], warehouses: warehouses.results ?? [], currencies: currencies.results ?? [] }, 200, request);
}

async function listCustomers(env, request) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim();
  const limit = boundedLimit(url);
  const result = await env.ONEX_DB.prepare(`
    SELECT id, companyId, code, legalName, currencyCode, status
    FROM customers
    WHERE ? = '' OR code LIKE '%' || ? || '%' OR legalName LIKE '%' || ? || '%'
    ORDER BY code
    LIMIT ?
  `).bind(search, search, search, limit).all();
  return json({ rows: result.results ?? [] }, 200, request);
}

async function createInvoice(env, request) {
  requireWriteAuth(request, env);
  const body = await readJson(request);
  const docNo = typeof body.docNo === "string" ? body.docNo.trim() : "";
  const customerId = body.customerId;
  const warehouseId = body.warehouseId;
  const lines = body.lines;
  const currencyCode = typeof body.currencyCode === "string" ? body.currencyCode.toUpperCase() : "SAR";
  const exchangeRate = decimal(body.exchangeRate ?? 1, { min: 0, allowZero: false });
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : null;
  const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.toUpperCase() : "CASH";
  const paidAmountInput = decimal(body.paidAmount ?? 0, { min: 0, allowZero: true });
  const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.slice(0, 160) : null;
  const postNow = body.postNow === true;
  if (!docNo || docNo.length > 80 || !positiveInteger(customerId) || !positiveInteger(warehouseId) || exchangeRate === null || !Array.isArray(lines) || lines.length === 0 || lines.length > 200) {
    return errorResponse("INVALID_INVOICE_INPUT", 400, request);
  }

  let subtotal = 0;
  let taxTotal = 0;
  const normalizedLines = [];
  for (const line of lines) {
    const itemId = Number(line?.itemId);
    const quantity = decimal(line?.quantity, { min: 0, allowZero: false });
    const unitPrice = decimal(line?.unitPrice, { min: 0, allowZero: true });
    const taxAmount = decimal(line?.taxAmount ?? 0, { min: 0, allowZero: true });
    if (!positiveInteger(itemId) || quantity === null || unitPrice === null || taxAmount === null) return errorResponse("INVALID_INVOICE_LINE", 400, request);
    const lineTotal = quantity * unitPrice + taxAmount;
    subtotal += quantity * unitPrice;
    taxTotal += taxAmount;
    normalizedLines.push({ itemId, quantity, unitPrice, taxAmount, lineTotal });
  }
  const grandTotal = subtotal + taxTotal;
  if (!exchangeRate || paidAmountInput === null || !["CASH", "CREDIT", "CHECK", "WALLET", "BANK_TRANSFER"].includes(paymentMethod)) return errorResponse("INVALID_PAYMENT_INPUT", 400, request);
  if (paidAmountInput > grandTotal) return errorResponse("PAID_AMOUNT_EXCEEDS_TOTAL", 400, request);
  if (paidAmountInput > 0 && paymentMethod === "CREDIT") return errorResponse("CREDIT_PAYMENT_CANNOT_HAVE_PAID_AMOUNT", 400, request);
  if (paidAmountInput > 0 && ["CHECK", "WALLET", "BANK_TRANSFER"].includes(paymentMethod) && !paymentReference) return errorResponse("PAYMENT_REFERENCE_REQUIRED", 400, request);
  const remainingAmount = grandTotal - paidAmountInput;
  const idempotencyKey = `ARST004:${docNo}`;

  const references = await env.ONEX_DB.batch([
    env.ONEX_DB.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId),
    env.ONEX_DB.prepare("SELECT id FROM warehouses WHERE id = ? LIMIT 1").bind(warehouseId),
    env.ONEX_DB.prepare(`SELECT id FROM items WHERE id IN (${normalizedLines.map(() => "?").join(",")})`).bind(...normalizedLines.map((line) => line.itemId)),
    env.ONEX_DB.prepare("SELECT code FROM currencies WHERE code = ? AND active = 1 LIMIT 1").bind(currencyCode),
    env.ONEX_DB.prepare("SELECT id, docNo, subtotal, taxTotal, grandTotal, status FROM invoices WHERE idempotencyKey = ? LIMIT 1").bind(idempotencyKey),
  ]);
  if (!references[0].results?.length) return errorResponse("CUSTOMER_NOT_FOUND", 400, request);
  if (!references[1].results?.length) return errorResponse("WAREHOUSE_NOT_FOUND", 400, request);
  if ((references[2].results ?? []).length !== new Set(normalizedLines.map((line) => line.itemId)).size) return errorResponse("ITEM_NOT_FOUND", 400, request);
  if (!references[3].results?.length) return errorResponse("CURRENCY_NOT_FOUND", 400, request);
  const existing = references[4].results?.[0];
  if (existing) return json({ invoiceId: existing.id, docNo: existing.docNo, subtotal: Number(existing.subtotal), taxTotal: Number(existing.taxTotal), grandTotal: Number(existing.grandTotal), status: existing.status, idempotent: true }, 200, request);

  const created = await env.ONEX_DB.prepare(`
    INSERT INTO invoices (docNo, customerId, warehouseId, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, status, idempotencyKey, sourceForm, notes, paymentMethod, paidAmount, remainingAmount, paymentReference, createdBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ARST004', ?, ?, ?, ?, ?, ?)
    RETURNING id, docNo, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, status, notes, paymentMethod, paidAmount, remainingAmount, paymentReference
  `).bind(docNo, customerId, warehouseId, currencyCode, exchangeRate.toFixed(8), subtotal.toFixed(6), taxTotal.toFixed(6), grandTotal.toFixed(6), postNow ? "POSTED" : "DRAFT", idempotencyKey, notes, paymentMethod, paidAmountInput.toFixed(6), remainingAmount.toFixed(6), paymentReference, "cloudflare-worker").first();
  if (!created) return errorResponse("INVOICE_CREATE_FAILED", 500, request);

  const statements = normalizedLines.map((line) => env.ONEX_DB.prepare(`
    INSERT INTO invoice_lines (invoiceId, itemId, quantity, unitPrice, taxAmount, lineTotal)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(created.id, line.itemId, line.quantity.toFixed(6), line.unitPrice.toFixed(6), line.taxAmount.toFixed(6), line.lineTotal.toFixed(6)));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId)
    VALUES (?, 'CREATE', 'AR_DOC', ?, ?)
  `).bind("cloudflare-worker", String(created.id), idempotencyKey));
  if (postNow) {
    const salesJournalNo = `AR-SALE-${created.docNo}`;
    statements.push(env.ONEX_DB.prepare("INSERT INTO journal_entries (journalNo, entryType, totalDebit, totalCredit) VALUES (?, 'AR_SALE', ?, ?)").bind(salesJournalNo, grandTotal.toFixed(6), grandTotal.toFixed(6)));
    statements.push(env.ONEX_DB.prepare("INSERT INTO journal_entry_lines (journalEntryId, accountCode, debit, credit, description) VALUES ((SELECT id FROM journal_entries WHERE journalNo = ?), '1100', ?, '0', ?), ((SELECT id FROM journal_entries WHERE journalNo = ?), '4100', '0', ?, ?), ((SELECT id FROM journal_entries WHERE journalNo = ?), '2200', '0', ?, ?)").bind(salesJournalNo, grandTotal.toFixed(6), `فاتورة ${created.docNo}`, salesJournalNo, subtotal.toFixed(6), `مبيعات ${created.docNo}`, salesJournalNo, taxTotal.toFixed(6), `ضريبة ${created.docNo}`));
    if (paidAmountInput > 0) {
      const voucherNo = `REC-${created.docNo}`;
      statements.push(env.ONEX_DB.prepare("INSERT INTO payment_vouchers (voucherNo, direction, partyType, partyId, currencyCode, exchangeRate, amount, localAmount, accountCode, reference, notes, status, createdBy) VALUES (?, 'INCOMING', 'CUSTOMER', ?, ?, ?, ?, ?, ?, ?, ?, 'POSTED', ?)").bind(voucherNo, customerId, currencyCode, exchangeRate.toFixed(8), paidAmountInput.toFixed(6), (paidAmountInput * exchangeRate).toFixed(6), paymentMethod === "WALLET" ? "1200" : "1100", paymentReference, `سداد من الفاتورة ${created.docNo}`, "cloudflare-worker"));
      const receiptJournalNo = `AR-RECEIPT-${created.docNo}`;
      statements.push(env.ONEX_DB.prepare("INSERT INTO journal_entries (journalNo, entryType, totalDebit, totalCredit) VALUES (?, 'AR_RECEIPT', ?, ?)").bind(receiptJournalNo, paidAmountInput.toFixed(6), paidAmountInput.toFixed(6)));
      statements.push(env.ONEX_DB.prepare("INSERT INTO journal_entry_lines (journalEntryId, accountCode, debit, credit, description) VALUES ((SELECT id FROM journal_entries WHERE journalNo = ?), ?, ?, '0', ?), ((SELECT id FROM journal_entries WHERE journalNo = ?), '1201', '0', ?, ?)").bind(receiptJournalNo, paymentMethod === "WALLET" ? "1200" : "1100", paidAmountInput.toFixed(6), `قبض ${created.docNo}`, receiptJournalNo, paidAmountInput.toFixed(6), `تسديد العميل ${created.docNo}`));
    }
  }
  await env.ONEX_DB.batch(statements);
  return json({ invoiceId: created.id, docNo: created.docNo, currencyCode: created.currencyCode, exchangeRate: Number(created.exchangeRate), subtotal: Number(created.subtotal), taxTotal: Number(created.taxTotal), grandTotal: Number(created.grandTotal), localGrandTotal: Number(created.grandTotal) * Number(created.exchangeRate), paidAmount: Number(created.paidAmount), remainingAmount: Number(created.remainingAmount), paymentMethod: created.paymentMethod, paymentReference: created.paymentReference, notes: created.notes, status: created.status }, 201, request);
}

async function listInvoices(env, request) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim();
  const limit = boundedLimit(url);
  const result = await env.ONEX_DB.prepare(`
    SELECT id, docNo, customerId, warehouseId, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, status, paymentMethod, paidAmount, remainingAmount, paymentReference, notes, createdBy, createdAt, updatedAt, postedAt
    FROM invoices
    WHERE ? = '' OR docNo LIKE '%' || ? || '%' OR status LIKE '%' || ? || '%'
    ORDER BY createdAt DESC
    LIMIT ?
  `).bind(search, search, search, limit).all();
  return json({ rows: result.results ?? [] }, 200, request);
}

async function listItems(env, request) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim();
  const warehouseId = positiveInteger(Number(url.searchParams.get("warehouseId"))) ? Number(url.searchParams.get("warehouseId")) : 1;
  const limit = boundedLimit(url, 30);
  const result = await env.ONEX_DB.prepare(`
    SELECT i.id, i.companyId, i.code, COALESCE(NULLIF(i.description, ''), i.name) AS description, i.stockFlag, i.unitCost, i.salePrice, i.revenueAccount, i.inventoryAccount, i.cogsAccount, i.active, COALESCE(sb.quantity, '0') AS availableQuantity, ? AS warehouseId
    FROM items i LEFT JOIN stock_balances sb ON sb.itemId = i.id AND sb.warehouseId = ?
    WHERE active = 1 AND (? = '' OR code LIKE '%' || ? || '%' OR description LIKE '%' || ? || '%' OR name LIKE '%' || ? || '%')
    ORDER BY code
    LIMIT ?
  `).bind(warehouseId, warehouseId, search, search, search, search, limit).all();
  return json({ rows: result.results ?? [] }, 200, request);
}

async function getInvoice(env, request, invoiceId) {
  if (!positiveInteger(invoiceId)) return errorResponse("INVALID_INVOICE_ID", 400, request);
  const invoice = await env.ONEX_DB.prepare(`SELECT id, docNo, customerId, warehouseId, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, status, paymentMethod, paidAmount, remainingAmount, paymentReference, notes, createdBy, createdAt, updatedAt, postedAt FROM invoices WHERE id = ? LIMIT 1`).bind(invoiceId).first();
  if (!invoice) return errorResponse("INVOICE_NOT_FOUND", 404, request);
  const lines = await env.ONEX_DB.prepare(`SELECT l.id, l.itemId, i.code, COALESCE(NULLIF(i.description, ''), i.name) AS description, l.quantity, l.unitPrice, l.taxAmount, l.lineTotal FROM invoice_lines l JOIN items i ON i.id = l.itemId WHERE l.invoiceId = ? ORDER BY l.id`).bind(invoiceId).all();
  return json({ ...invoice, exchangeRate: Number(invoice.exchangeRate), subtotal: Number(invoice.subtotal), taxTotal: Number(invoice.taxTotal), grandTotal: Number(invoice.grandTotal), paidAmount: Number(invoice.paidAmount), remainingAmount: Number(invoice.remainingAmount), localGrandTotal: Number(invoice.grandTotal) * Number(invoice.exchangeRate), lines: lines.results ?? [] }, 200, request);
}

async function editInvoice(env, request, invoiceId) {
  requireWriteAuth(request, env);
  if (!positiveInteger(invoiceId)) return errorResponse("INVALID_INVOICE_ID", 400, request);
  const current = await env.ONEX_DB.prepare("SELECT id, status FROM invoices WHERE id = ? LIMIT 1").bind(invoiceId).first();
  if (!current) return errorResponse("INVOICE_NOT_FOUND", 404, request);
  if (current.status !== "DRAFT") return errorResponse("ONLY_DRAFT_INVOICES_CAN_BE_EDITED", 409, request);
  const body = await readJson(request);
  const docNo = typeof body.docNo === "string" ? body.docNo.trim() : "";
  const currencyCode = typeof body.currencyCode === "string" ? body.currencyCode.toUpperCase() : "SAR";
  const exchangeRate = decimal(body.exchangeRate ?? 1, { min: 0, allowZero: false });
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!docNo || docNo.length > 80 || exchangeRate === null || !lines.length || lines.length > 200) return errorResponse("INVALID_INVOICE_INPUT", 400, request);
  const normalized = [];
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const itemId = Number(line?.itemId);
    const quantity = decimal(line?.quantity, { min: 0, allowZero: false });
    const unitPrice = decimal(line?.unitPrice, { min: 0, allowZero: true });
    const taxAmount = decimal(line?.taxAmount ?? 0, { min: 0, allowZero: true });
    if (!positiveInteger(itemId) || quantity === null || unitPrice === null || taxAmount === null) return errorResponse("INVALID_INVOICE_LINE", 400, request);
    const lineTotal = quantity * unitPrice + taxAmount;
    subtotal += quantity * unitPrice;
    taxTotal += taxAmount;
    normalized.push({ itemId, quantity, unitPrice, taxAmount, lineTotal });
  }
  const validCurrency = await env.ONEX_DB.prepare("SELECT code FROM currencies WHERE code = ? AND active = 1 LIMIT 1").bind(currencyCode).first();
  if (!validCurrency) return errorResponse("CURRENCY_NOT_FOUND", 400, request);
  await env.ONEX_DB.prepare("UPDATE invoices SET docNo = ?, currencyCode = ?, exchangeRate = ?, subtotal = ?, taxTotal = ?, grandTotal = ?, notes = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND status = 'DRAFT'").bind(docNo, currencyCode, exchangeRate.toFixed(8), subtotal.toFixed(6), taxTotal.toFixed(6), (subtotal + taxTotal).toFixed(6), typeof body.notes === "string" ? body.notes.slice(0, 1000) : null, invoiceId).run();
  await env.ONEX_DB.prepare("DELETE FROM invoice_lines WHERE invoiceId = ?").bind(invoiceId).run();
  await env.ONEX_DB.batch(normalized.map((line) => env.ONEX_DB.prepare("INSERT INTO invoice_lines (invoiceId, itemId, quantity, unitPrice, taxAmount, lineTotal) VALUES (?, ?, ?, ?, ?, ?)").bind(invoiceId, line.itemId, line.quantity.toFixed(6), line.unitPrice.toFixed(6), line.taxAmount.toFixed(6), line.lineTotal.toFixed(6))));
  return getInvoice(env, request, invoiceId);
}

async function createPurchase(env, request) {
  requireWriteAuth(request, env);
  const body = await readJson(request);
  const docNo = typeof body.docNo === "string" ? body.docNo.trim() : "";
  const supplierId = Number(body.supplierId);
  const warehouseId = Number(body.warehouseId);
  const currencyCode = typeof body.currencyCode === "string" ? body.currencyCode.toUpperCase() : "SAR";
  const exchangeRate = decimal(body.exchangeRate ?? 1, { min: 0, allowZero: false });
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (!docNo || !positiveInteger(supplierId) || !positiveInteger(warehouseId) || exchangeRate === null || !lines.length) return errorResponse("INVALID_PURCHASE_INPUT", 400, request);
  let subtotal = 0;
  let taxTotal = 0;
  const normalized = [];
  for (const line of lines) {
    const itemId = Number(line?.itemId);
    const quantity = decimal(line?.quantity, { min: 0, allowZero: false });
    const unitPrice = decimal(line?.unitPrice, { min: 0, allowZero: true });
    const taxAmount = decimal(line?.taxAmount ?? 0, { min: 0, allowZero: true });
    if (!positiveInteger(itemId) || quantity === null || unitPrice === null || taxAmount === null) return errorResponse("INVALID_PURCHASE_LINE", 400, request);
    subtotal += quantity * unitPrice; taxTotal += taxAmount;
    normalized.push({ itemId, quantity, unitPrice, taxAmount, lineTotal: quantity * unitPrice + taxAmount });
  }
  const valid = await env.ONEX_DB.batch([
    env.ONEX_DB.prepare("SELECT id FROM suppliers WHERE id = ? LIMIT 1").bind(supplierId),
    env.ONEX_DB.prepare("SELECT id FROM warehouses WHERE id = ? LIMIT 1").bind(warehouseId),
    env.ONEX_DB.prepare("SELECT code FROM currencies WHERE code = ? AND active = 1 LIMIT 1").bind(currencyCode),
  ]);
  if (!valid[0].results?.length) return errorResponse("SUPPLIER_NOT_FOUND", 400, request);
  if (!valid[1].results?.length) return errorResponse("WAREHOUSE_NOT_FOUND", 400, request);
  if (!valid[2].results?.length) return errorResponse("CURRENCY_NOT_FOUND", 400, request);
  const idempotencyKey = `AP:${docNo}`;
  const created = await env.ONEX_DB.prepare("INSERT INTO purchase_invoices (docNo, supplierId, warehouseId, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, idempotencyKey, notes, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, docNo, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, status").bind(docNo, supplierId, warehouseId, currencyCode, exchangeRate.toFixed(8), subtotal.toFixed(6), taxTotal.toFixed(6), (subtotal + taxTotal).toFixed(6), idempotencyKey, typeof body.notes === "string" ? body.notes.slice(0, 1000) : null, "cloudflare-worker").first();
  await env.ONEX_DB.batch(normalized.map((line) => env.ONEX_DB.prepare("INSERT INTO purchase_lines (purchaseInvoiceId, itemId, quantity, unitPrice, taxAmount, lineTotal) VALUES (?, ?, ?, ?, ?, ?)").bind(created.id, line.itemId, line.quantity.toFixed(6), line.unitPrice.toFixed(6), line.taxAmount.toFixed(6), line.lineTotal.toFixed(6))));
  return json({ ...created, exchangeRate: Number(created.exchangeRate), subtotal: Number(created.subtotal), taxTotal: Number(created.taxTotal), grandTotal: Number(created.grandTotal), localGrandTotal: Number(created.grandTotal) * Number(created.exchangeRate) }, 201, request);
}

async function createVoucher(env, request) {
  requireWriteAuth(request, env);
  const body = await readJson(request);
  const voucherNo = typeof body.voucherNo === "string" ? body.voucherNo.trim() : "";
  const direction = body.direction;
  const partyType = body.partyType;
  const currencyCode = typeof body.currencyCode === "string" ? body.currencyCode.toUpperCase() : "SAR";
  const amount = decimal(body.amount, { min: 0, allowZero: false });
  const exchangeRate = decimal(body.exchangeRate ?? 1, { min: 0, allowZero: false });
  if (!voucherNo || !["INCOMING", "OUTGOING"].includes(direction) || !["CUSTOMER", "SUPPLIER", "OTHER"].includes(partyType) || amount === null || exchangeRate === null) return errorResponse("INVALID_VOUCHER_INPUT", 400, request);
  const validCurrency = await env.ONEX_DB.prepare("SELECT code FROM currencies WHERE code = ? AND active = 1 LIMIT 1").bind(currencyCode).first();
  if (!validCurrency) return errorResponse("CURRENCY_NOT_FOUND", 400, request);
  const created = await env.ONEX_DB.prepare("INSERT INTO payment_vouchers (voucherNo, direction, partyType, partyId, currencyCode, exchangeRate, amount, localAmount, accountCode, reference, notes, createdBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, voucherNo, direction, partyType, partyId, currencyCode, exchangeRate, amount, localAmount, accountCode, reference, notes, status, createdAt").bind(voucherNo, direction, partyType, positiveInteger(Number(body.partyId)) ? Number(body.partyId) : null, currencyCode, exchangeRate.toFixed(8), amount.toFixed(6), (amount * exchangeRate).toFixed(6), typeof body.accountCode === "string" ? body.accountCode.slice(0, 80) : null, typeof body.reference === "string" ? body.reference.slice(0, 160) : null, typeof body.notes === "string" ? body.notes.slice(0, 1000) : null, "cloudflare-worker").first();
  return json({ ...created, exchangeRate: Number(created.exchangeRate), amount: Number(created.amount), localAmount: Number(created.localAmount) }, 201, request);
}

async function updateInvoiceStatus(env, request, invoiceId, targetStatus) {
  requireWriteAuth(request, env);
  if (!positiveInteger(invoiceId)) return errorResponse("INVALID_INVOICE_ID", 400, request);
  const current = await env.ONEX_DB.prepare("SELECT id, docNo, status, grandTotal FROM invoices WHERE id = ? LIMIT 1").bind(invoiceId).first();
  if (!current) return errorResponse("INVOICE_NOT_FOUND", 404, request);
  const expected = targetStatus === "POSTED" ? "DRAFT" : "POSTED";
  if (current.status !== expected) return errorResponse("INVALID_INVOICE_STATE", 409, request);
  await env.ONEX_DB.prepare("UPDATE invoices SET status = ?, postedAt = CASE WHEN ? = 'POSTED' THEN CURRENT_TIMESTAMP ELSE postedAt END WHERE id = ? AND status = ?").bind(targetStatus, targetStatus, invoiceId, expected).run();
  await env.ONEX_DB.prepare("INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId) VALUES (?, ?, 'AR_DOC', ?, ?)").bind("cloudflare-worker", targetStatus === "POSTED" ? "POST" : "REVERSE", String(invoiceId), `${targetStatus}:${current.docNo}`).run();
  return json({ invoiceId, status: targetStatus }, 200, request);
}

async function receiveStock(env, request) {
  requireWriteAuth(request, env);
  const body = await readJson(request);
  const itemId = Number(body.itemId);
  const warehouseId = Number(body.warehouseId);
  const quantity = decimal(body.quantity, { min: 0, allowZero: false });
  const unitCost = decimal(body.unitCost, { min: 0, allowZero: true });
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!positiveInteger(itemId) || !positiveInteger(warehouseId) || quantity === null || unitCost === null || !reference || reference.length > 80) return errorResponse("INVALID_STOCK_RECEIPT", 400, request);
  const refs = await env.ONEX_DB.batch([
    env.ONEX_DB.prepare("SELECT id FROM items WHERE id = ? LIMIT 1").bind(itemId),
    env.ONEX_DB.prepare("SELECT id FROM warehouses WHERE id = ? LIMIT 1").bind(warehouseId),
    env.ONEX_DB.prepare("SELECT id, quantity, totalCost, unitCost, versionNo FROM stock_balances WHERE itemId = ? AND warehouseId = ? LIMIT 1").bind(itemId, warehouseId),
  ]);
  if (!refs[0].results?.length) return errorResponse("ITEM_NOT_FOUND", 400, request);
  if (!refs[1].results?.length) return errorResponse("WAREHOUSE_NOT_FOUND", 400, request);
  const balance = refs[2].results?.[0];
  const beforeQty = Number(balance?.quantity ?? 0);
  const beforeCost = Number(balance?.totalCost ?? 0);
  const afterQty = beforeQty + quantity;
  const afterCost = beforeCost + quantity * unitCost;
  const statements = [];
  if (balance) {
    statements.push(env.ONEX_DB.prepare("UPDATE stock_balances SET quantity = ?, totalCost = ?, unitCost = ?, versionNo = versionNo + 1 WHERE id = ? AND versionNo = ?").bind(afterQty.toFixed(6), afterCost.toFixed(6), (afterCost / afterQty).toFixed(6), balance.id, balance.versionNo));
  } else {
    statements.push(env.ONEX_DB.prepare("INSERT INTO stock_balances (itemId, warehouseId, quantity, totalCost, unitCost, versionNo) VALUES (?, ?, ?, ?, ?, 1)").bind(itemId, warehouseId, quantity.toFixed(6), (quantity * unitCost).toFixed(6), unitCost.toFixed(6)));
  }
  statements.push(env.ONEX_DB.prepare("INSERT INTO stock_movements (itemId, warehouseId, movementType, quantityIn, unitCost, totalCost, balanceAfter, createdBy, reference) VALUES (?, ?, 'PURCHASE_RECEIPT', ?, ?, ?, ?, ?, ?)").bind(itemId, warehouseId, quantity.toFixed(6), unitCost.toFixed(6), (quantity * unitCost).toFixed(6), afterQty.toFixed(6), "cloudflare-worker", reference));
  statements.push(env.ONEX_DB.prepare("INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId) VALUES (?, 'RECEIVE', 'STOCK', ?, ?)").bind("cloudflare-worker", `${itemId}:${warehouseId}`, `RECEIVE:${reference}`));
  await env.ONEX_DB.batch(statements);
  return json({ itemId, warehouseId, quantity: quantity.toFixed(6), unitCost: unitCost.toFixed(6), totalCost: (quantity * unitCost).toFixed(6), status: "RECEIVED", reference }, 201, request);
}

export default {
  async fetch(request, env) {
    const headers = responseHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const url = new URL(request.url);
      if (url.pathname === "/__health" && request.method === "GET") return health(env, request);
      if (url.pathname === "/api/erp/master-data" && request.method === "GET") return masterData(env, request);
      if (url.pathname === "/api/erp/customers" && request.method === "GET") return listCustomers(env, request);
      if (url.pathname === "/api/erp/items" && request.method === "GET") return listItems(env, request);
      if (url.pathname === "/api/erp/invoices" && request.method === "GET") return listInvoices(env, request);
      if (url.pathname === "/api/erp/invoices" && request.method === "POST") return createInvoice(env, request);
      const invoiceIdMatch = url.pathname.match(/^\/api\/erp\/invoices\/(\d+)$/);
      if (invoiceIdMatch && request.method === "GET") return getInvoice(env, request, Number(invoiceIdMatch[1]));
      if (invoiceIdMatch && request.method === "PATCH") return editInvoice(env, request, Number(invoiceIdMatch[1]));
      const invoiceMatch = url.pathname.match(/^\/api\/erp\/invoices\/(\d+)\/(post|reverse)$/);
      if (invoiceMatch && request.method === "POST") return updateInvoiceStatus(env, request, Number(invoiceMatch[1]), invoiceMatch[2] === "post" ? "POSTED" : "REVERSED");
      if (url.pathname === "/api/erp/purchases" && request.method === "POST") return createPurchase(env, request);
      if (url.pathname === "/api/erp/vouchers" && request.method === "POST") return createVoucher(env, request);
      if (url.pathname === "/api/erp/inventory/receive" && request.method === "POST") return receiveStock(env, request);
      return proxyWorkbench(request);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("Worker request failed", error);
      return errorResponse(error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR", 500, request);
    }
  },
};
