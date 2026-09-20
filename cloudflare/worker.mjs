const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const ORIGIN = "https://onexdash-oyedvqsk.manus.space";
const ALLOWED_METHODS = "GET,POST,PATCH,DELETE,OPTIONS";
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
  // /api/cloud/* is already protected by the actor gate in api().
  // Keep the bearer-token requirement for /api/erp/* while allowing the authenticated
  // workbench actor to use the same atomic domain functions through the cloud route.
  if (request.headers.get("x-onex-actor")?.trim()) return;
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
  const [companies, customers, suppliers, items, warehouses, currencies, cashBoxes, banks, accountingDefaults] = await env.ONEX_DB.batch([
    env.ONEX_DB.prepare("SELECT id, code, name, baseCurrency FROM companies ORDER BY id LIMIT 20"),
    env.ONEX_DB.prepare("SELECT id, companyId, accountId, code, legalName, currencyCode, status FROM customers ORDER BY code LIMIT 100"),
    env.ONEX_DB.prepare("SELECT id, companyId, accountId, code, legalName, currencyCode, status FROM suppliers ORDER BY code LIMIT 100"),
    env.ONEX_DB.prepare("SELECT id, companyId, code, COALESCE(NULLIF(description, ''), name) AS description, name, currencyCode, unitCode, stockFlag, unitCost, salePrice, revenueAccount, inventoryAccount, cogsAccount, active FROM items ORDER BY code LIMIT 100"),
    env.ONEX_DB.prepare("SELECT id, companyId, code, name, active FROM warehouses ORDER BY code LIMIT 50"),
    env.ONEX_DB.prepare("SELECT code, name, decimalScale, active FROM currencies WHERE active = 1 ORDER BY code"),
    env.ONEX_DB.prepare("SELECT id, companyId, code, name, accountId, currencyCode, active FROM cash_boxes ORDER BY code LIMIT 50"),
    env.ONEX_DB.prepare("SELECT id, companyId, code, name, accountId, accountNumber, currencyCode, active FROM banks ORDER BY code LIMIT 50"),
    env.ONEX_DB.prepare("SELECT * FROM accounting_defaults WHERE companyId = 1 LIMIT 1"),
  ]);
  return json({ companies: companies.results ?? [], customers: customers.results ?? [], suppliers: suppliers.results ?? [], items: items.results ?? [], warehouses: warehouses.results ?? [], currencies: currencies.results ?? [], cashBoxes: cashBoxes.results ?? [], banks: banks.results ?? [], accountingDefaults: accountingDefaults.results?.[0] ?? null }, 200, request);
}

async function listCustomers(env, request) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim();
  const limit = boundedLimit(url);
  const result = await env.ONEX_DB.prepare(`
    SELECT id, companyId, accountId, code, legalName, currencyCode, status
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, 'ARST004', ?, ?, ?, ?, ?, ?)
    RETURNING id, docNo, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, status, notes, paymentMethod, paidAmount, remainingAmount, paymentReference
  `).bind(docNo, customerId, warehouseId, currencyCode, exchangeRate.toFixed(8), subtotal.toFixed(6), taxTotal.toFixed(6), grandTotal.toFixed(6), idempotencyKey, notes, paymentMethod, paidAmountInput.toFixed(6), remainingAmount.toFixed(6), paymentReference, "cloudflare-worker").first();
  if (!created) return errorResponse("INVOICE_CREATE_FAILED", 500, request);

  const statements = normalizedLines.map((line) => env.ONEX_DB.prepare(`
    INSERT INTO invoice_lines (invoiceId, itemId, quantity, unitPrice, taxAmount, lineTotal)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(created.id, line.itemId, line.quantity.toFixed(6), line.unitPrice.toFixed(6), line.taxAmount.toFixed(6), line.lineTotal.toFixed(6)));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId)
    VALUES (?, 'CREATE', 'AR_DOC', ?, ?)
  `).bind("cloudflare-worker", String(created.id), idempotencyKey));
  await env.ONEX_DB.batch(statements);
  if (postNow) return postSalesInvoice(env, request, created.id);
  return json({ invoiceId: created.id, docNo: created.docNo, currencyCode: created.currencyCode, exchangeRate: Number(created.exchangeRate), subtotal: Number(created.subtotal), taxTotal: Number(created.taxTotal), grandTotal: Number(created.grandTotal), localGrandTotal: Number(created.grandTotal) * Number(created.exchangeRate), paidAmount: Number(created.paidAmount), remainingAmount: Number(created.remainingAmount), paymentMethod: created.paymentMethod, paymentReference: created.paymentReference, notes: created.notes, status: created.status }, 201, request);
}

async function listInvoices(env, request) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim();
  const limit = boundedLimit(url);
  const result = await env.ONEX_DB.prepare(`
    SELECT id, docNo, customerId, warehouseId, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, status, paymentMethod, paidAmount, remainingAmount, paymentReference, notes, cogsJournalNo, inventoryPostedAt, createdBy, createdAt, updatedAt, postedAt
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
  const invoice = await env.ONEX_DB.prepare(`SELECT id, docNo, customerId, warehouseId, currencyCode, exchangeRate, subtotal, taxTotal, grandTotal, status, paymentMethod, paidAmount, remainingAmount, paymentReference, notes, cogsJournalNo, inventoryPostedAt, createdBy, createdAt, updatedAt, postedAt FROM invoices WHERE id = ? LIMIT 1`).bind(invoiceId).first();
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
  if (body.postNow === true) return postPurchaseInvoice(env, request, created.id);
  return json({ ...created, exchangeRate: Number(created.exchangeRate), subtotal: Number(created.subtotal), taxTotal: Number(created.taxTotal), grandTotal: Number(created.grandTotal), localGrandTotal: Number(created.grandTotal) * Number(created.exchangeRate) }, 201, request);
}


async function postPurchaseInvoice(env, request, purchaseId) {
  requireWriteAuth(request, env);
  const purchase = await env.ONEX_DB.prepare(`
    SELECT id, docNo, supplierId, warehouseId, currencyCode, exchangeRate, subtotal, taxTotal,
           grandTotal, status, inventoryJournalNo
    FROM purchase_invoices WHERE id = ? LIMIT 1
  `).bind(purchaseId).first();
  if (!purchase) return errorResponse("PURCHASE_INVOICE_NOT_FOUND", 404, request);
  if (purchase.status === "POSTED") return json({ purchaseInvoiceId: purchaseId, status: "POSTED", idempotent: true }, 200, request);
  if (purchase.status !== "DRAFT") return errorResponse("INVALID_PURCHASE_STATE", 409, request);

  const linesResult = await env.ONEX_DB.prepare(`
    SELECT id, itemId, quantity, unitPrice, taxAmount FROM purchase_lines
    WHERE purchaseInvoiceId = ? ORDER BY id
  `).bind(purchaseId).all();
  const lines = linesResult.results ?? [];
  if (!lines.length) return errorResponse("PURCHASE_HAS_NO_LINES", 400, request);

  const rate = Number(purchase.exchangeRate);
  const balances = new Map();
  const plans = [];
  let inventoryTotal = 0;
  for (const line of lines) {
    let balance = balances.get(line.itemId);
    if (!balance) {
      balance = await env.ONEX_DB.prepare(`
        SELECT id, quantity, totalCost, unitCost, versionNo
        FROM stock_balances WHERE itemId = ? AND warehouseId = ? LIMIT 1
      `).bind(line.itemId, purchase.warehouseId).first();
      if (!balance) balance = { id: null, quantity: 0, totalCost: 0, unitCost: 0, versionNo: null };
      else balance = { ...balance, quantity: Number(balance.quantity), totalCost: Number(balance.totalCost), unitCost: Number(balance.unitCost) };
      balances.set(line.itemId, balance);
    }
    const quantity = Number(line.quantity);
    const inputUnitCost = Number(line.unitPrice) * rate;
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(inputUnitCost) || inputUnitCost < 0) return errorResponse("INVALID_PURCHASE_LINE", 400, request);
    const receivedValue = quantity * inputUnitCost;
    const beforeQty = balance.quantity;
    const beforeTotal = balance.totalCost;
    balance.quantity = beforeQty + quantity;
    balance.totalCost = beforeTotal + receivedValue;
    balance.unitCost = balance.quantity > 0 ? balance.totalCost / balance.quantity : inputUnitCost;
    inventoryTotal += receivedValue;
    plans.push({ line, quantity, inputUnitCost, receivedValue, balance });
  }

  const journalNo = `AP-PURCHASE-${purchase.docNo}`;
  const total = inventoryTotal.toFixed(6);
  const statements = [];
  for (const plan of plans.filter((x, i, a) => a.findIndex((y) => y.line.itemId === x.line.itemId) === i)) {
    const b = plan.balance;
    const itemQty = plans.filter((x) => x.line.itemId === plan.line.itemId).reduce((sum, x) => sum + x.quantity, 0);
    const beforeQty = b.quantity - itemQty;
    const beforeTotal = b.totalCost - plans.filter((x) => x.line.itemId === plan.line.itemId).reduce((sum, x) => sum + x.receivedValue, 0);
    if (b.id === null) {
      statements.push(env.ONEX_DB.prepare(`
        INSERT INTO stock_balances (itemId, warehouseId, quantity, unitCost, totalCost, versionNo, reservedQuantity)
        VALUES (?, ?, ?, ?, ?, 1, '0')
      `).bind(plan.line.itemId, purchase.warehouseId, b.quantity.toFixed(6), b.unitCost.toFixed(6), b.totalCost.toFixed(6)));
    } else {
      statements.push(env.ONEX_DB.prepare(`
        UPDATE stock_balances SET quantity = ?, unitCost = ?, totalCost = ?, versionNo = versionNo + 1
        WHERE id = ? AND versionNo = ?
      `).bind(b.quantity.toFixed(6), b.unitCost.toFixed(6), b.totalCost.toFixed(6), b.id, b.versionNo));
    }
  }
  for (const plan of plans) {
    statements.push(env.ONEX_DB.prepare(`
      UPDATE purchase_lines SET appliedUnitCost = ?, appliedCostTotal = ? WHERE id = ?
    `).bind(plan.inputUnitCost.toFixed(6), plan.receivedValue.toFixed(6), plan.line.id));
    statements.push(env.ONEX_DB.prepare(`
      INSERT INTO stock_movements
        (itemId, warehouseId, sourceInvoiceId, sourcePurchaseInvoiceId, inventoryDocumentId,
         movementType, quantityIn, quantityOut, unitCost, totalCost, balanceAfter, createdBy, reference)
      VALUES (?, ?, NULL, ?, NULL, 'PURCHASE_RECEIPT', ?, '0', ?, ?, ?, ?, ?)
    `).bind(plan.line.itemId, purchase.warehouseId, purchase.id, plan.quantity.toFixed(6), plan.inputUnitCost.toFixed(6), plan.receivedValue.toFixed(6), plan.balance.quantity.toFixed(6), "cloudflare-worker", purchase.docNo));
  }
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO journal_entries (journalNo, entryType, sourceRef, sourcePurchaseInvoiceId, totalDebit, totalCredit, status, createdBy)
    VALUES (?, 'AP_PURCHASE', ?, ?, ?, ?, 'POSTED', ?)
  `).bind(journalNo, purchase.docNo, purchase.id, total, total, "cloudflare-worker"));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO journal_entry_lines (journalNo, accountCode, debit, credit, description)
    VALUES (?, '1300', ?, '0', ?), (?, '2100', '0', ?, ?)
  `).bind(journalNo, total, `مخزون مشتريات ${purchase.docNo}`, journalNo, total, `التزام مورد ${purchase.docNo}`));
  statements.push(env.ONEX_DB.prepare(`
    UPDATE purchase_invoices SET status = 'POSTED', postedAt = CURRENT_TIMESTAMP, inventoryJournalNo = ?, inventoryPostedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'DRAFT'
  `).bind(journalNo, purchase.id));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId)
    VALUES ('cloudflare-worker', 'POST', 'AP_DOC', ?, ?)
  `).bind(String(purchase.id), `AP_POST:${purchase.docNo}`));
  await env.ONEX_DB.batch(statements);
  return json({ purchaseInvoiceId: purchase.id, docNo: purchase.docNo, status: "POSTED", inventoryJournalNo: journalNo, inventoryTotal: total }, 200, request);
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


async function postSalesInvoice(env, request, invoiceId) {
  requireWriteAuth(request, env);
  const invoice = await env.ONEX_DB.prepare(`
    SELECT id, docNo, customerId, warehouseId, currencyCode, exchangeRate, subtotal, taxTotal,
           grandTotal, status, paymentMethod, paidAmount, remainingAmount, paymentReference
    FROM invoices WHERE id = ? LIMIT 1
  `).bind(invoiceId).first();
  if (!invoice) return errorResponse("INVOICE_NOT_FOUND", 404, request);
  if (invoice.status === "POSTED") return json({ invoiceId, status: "POSTED", idempotent: true }, 200, request);
  if (invoice.status !== "DRAFT") return errorResponse("INVALID_INVOICE_STATE", 409, request);

  const linesResult = await env.ONEX_DB.prepare(`
    SELECT id, itemId, quantity, unitPrice, taxAmount FROM invoice_lines
    WHERE invoiceId = ? ORDER BY id
  `).bind(invoiceId).all();
  const lines = linesResult.results ?? [];
  if (!lines.length) return errorResponse("INVOICE_HAS_NO_LINES", 400, request);

  const balances = new Map();
  const plans = [];
  let cogsTotal = 0;
  for (const line of lines) {
    let balance = balances.get(line.itemId);
    if (!balance) {
      balance = await env.ONEX_DB.prepare(`
        SELECT id, quantity, totalCost, unitCost, versionNo
        FROM stock_balances WHERE itemId = ? AND warehouseId = ? LIMIT 1
      `).bind(line.itemId, invoice.warehouseId).first();
      if (!balance) return errorResponse("INSUFFICIENT_STOCK", 409, request, { itemId: line.itemId, available: "0", required: line.quantity });
      balance = { ...balance, quantity: Number(balance.quantity), totalCost: Number(balance.totalCost), unitCost: Number(balance.unitCost) };
      balances.set(line.itemId, balance);
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return errorResponse("INVALID_INVOICE_LINE", 400, request);
    if (balance.quantity < quantity) return errorResponse("INSUFFICIENT_STOCK", 409, request, { itemId: line.itemId, available: balance.quantity.toFixed(6), required: quantity.toFixed(6) });
    const appliedUnitCost = balance.quantity > 0 ? balance.totalCost / balance.quantity : balance.unitCost;
    const appliedTotalCost = quantity * appliedUnitCost;
    balance.quantity -= quantity;
    balance.totalCost = Math.max(0, balance.totalCost - appliedTotalCost);
    balance.unitCost = balance.quantity > 0 ? balance.totalCost / balance.quantity : appliedUnitCost;
    cogsTotal += appliedTotalCost;
    plans.push({ line, quantity, appliedUnitCost, appliedTotalCost, balance });
  }

  const cogsValue = cogsTotal.toFixed(6);
  const cogsJournalNo = `AR-COGS-${invoice.docNo}`;
  const salesJournalNo = `AR-SALE-${invoice.docNo}`;
  const statements = [];
  const firstByItem = new Map();
  for (const plan of plans) {
    if (!firstByItem.has(plan.line.itemId)) firstByItem.set(plan.line.itemId, plan);
  }
  for (const plan of firstByItem.values()) {
    const b = plan.balance;
    statements.push(env.ONEX_DB.prepare(`
      UPDATE stock_balances
      SET quantity = ?, totalCost = ?, unitCost = ?, versionNo = versionNo + 1
      WHERE id = ? AND versionNo = ? AND CAST(quantity AS REAL) >= CAST(? AS REAL)
    `).bind(b.quantity.toFixed(6), b.totalCost.toFixed(6), b.unitCost.toFixed(6), b.id, b.versionNo, plans.filter((x) => x.line.itemId === plan.line.itemId).reduce((sum, x) => sum + x.quantity, 0).toFixed(6)));
  }
  for (const plan of plans) {
    statements.push(env.ONEX_DB.prepare(`
      UPDATE invoice_lines SET appliedUnitCost = ?, appliedCostTotal = ? WHERE id = ?
    `).bind(plan.appliedUnitCost.toFixed(6), plan.appliedTotalCost.toFixed(6), plan.line.id));
    statements.push(env.ONEX_DB.prepare(`
      INSERT INTO stock_movements
        (itemId, warehouseId, sourceInvoiceId, inventoryDocumentId, movementType,
         quantityIn, quantityOut, unitCost, totalCost, balanceAfter, createdBy, reference)
      VALUES (?, ?, ?, NULL, 'SALE_ISSUE', '0', ?, ?, ?, ?, ?, ?)
    `).bind(plan.line.itemId, invoice.warehouseId, invoice.id, plan.quantity.toFixed(6), plan.appliedUnitCost.toFixed(6), plan.appliedTotalCost.toFixed(6), plan.balance.quantity.toFixed(6), "cloudflare-worker", invoice.docNo));
  }
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO journal_entries (journalNo, entryType, sourceRef, sourceInvoiceId, totalDebit, totalCredit, status, createdBy)
    VALUES (?, 'AR_COGS', ?, ?, ?, ?, 'POSTED', ?)
  `).bind(cogsJournalNo, invoice.docNo, invoice.id, cogsValue, cogsValue, "cloudflare-worker"));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO journal_entry_lines (journalNo, accountCode, debit, credit, description)
    VALUES (?, '5100', ?, '0', ?), (?, '1300', '0', ?, ?)
  `).bind(cogsJournalNo, cogsValue, `تكلفة مبيعات ${invoice.docNo}`, cogsJournalNo, cogsValue, `خفض مخزون ${invoice.docNo}`));
  const grandTotal = Number(invoice.grandTotal);
  const subtotal = Number(invoice.subtotal);
  const taxTotal = Number(invoice.taxTotal);
  const totalText = grandTotal.toFixed(6);
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO journal_entries (journalNo, entryType, sourceRef, sourceInvoiceId, totalDebit, totalCredit, status, createdBy)
    VALUES (?, 'AR_SALE', ?, ?, ?, ?, 'POSTED', ?)
  `).bind(salesJournalNo, invoice.docNo, invoice.id, totalText, totalText, "cloudflare-worker"));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO journal_entry_lines (journalNo, accountCode, debit, credit, description)
    VALUES (?, '1100', ?, '0', ?), (?, '4100', '0', ?, ?), (?, '2200', '0', ?, ?)
  `).bind(salesJournalNo, totalText, `فاتورة ${invoice.docNo}`, salesJournalNo, subtotal.toFixed(6), `مبيعات ${invoice.docNo}`, salesJournalNo, taxTotal.toFixed(6), `ضريبة ${invoice.docNo}`));
  statements.push(env.ONEX_DB.prepare(`
    UPDATE invoices SET status = 'POSTED', postedAt = CURRENT_TIMESTAMP, cogsJournalNo = ?, inventoryPostedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'DRAFT'
  `).bind(cogsJournalNo, invoice.id));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId)
    VALUES ('cloudflare-worker', 'POST', 'AR_DOC', ?, ?)
  `).bind(String(invoice.id), `AR_POST:${invoice.docNo}`));
  await env.ONEX_DB.batch(statements);
  return json({ invoiceId: invoice.id, docNo: invoice.docNo, status: "POSTED", cogsJournalNo, cogsTotal: cogsValue }, 200, request);
}

async function updateInvoiceStatus(env, request, invoiceId, targetStatus) {
  requireWriteAuth(request, env);
  if (!positiveInteger(invoiceId)) return errorResponse("INVALID_INVOICE_ID", 400, request);
  const current = await env.ONEX_DB.prepare("SELECT id, docNo, status, grandTotal FROM invoices WHERE id = ? LIMIT 1").bind(invoiceId).first();
  if (!current) return errorResponse("INVOICE_NOT_FOUND", 404, request);
  const expected = targetStatus === "POSTED" ? "DRAFT" : "POSTED";
  if (targetStatus === "POSTED") return postSalesInvoice(env, request, invoiceId);
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

function inventoryParseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function inventoryRequiredText(value, max = 160) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : null;
}

function inventoryDecimalText(value, { min = null } = {}) {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^\d+(?:\.\d{1,9})?$/.test(text.trim())) return null;
  const normalized = text.trim();
  const number = Number(normalized);
  if (!Number.isFinite(number) || (min !== null && number < min)) return null;
  return number.toFixed(6);
}

async function inventoryBodyJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function inventoryResponse(data, request, env, status = 200) {
  return json(data, status, request);
}

function inventoryErrorResponse(code, request, env, status = 400, details) {
  return inventoryResponse({ error: code, ...(details ? { details } : {}) }, request, env, status);
}

/*
 * Production gate:
 * - Configure ONEX_API_TOKEN as a Worker secret.
 * - The upstream identity layer must set X-Onex-Actor after validating the user.
 * - Do not trust X-Onex-Actor from an untrusted public client.
 * Local tests can use the same secret through .dev.vars.
 */
function inventoryAuthorize(request, env, action) {
  const expected = env.ONEX_API_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied !== expected) {
    return { error: "UNAUTHORIZED", status: 401 };
  }

  const actor = inventoryRequiredText(request.headers.get("x-onex-actor"), 120);
  const companyId = inventoryParseId(request.headers.get("x-onex-company-id") || "1");
  if (!actor || !companyId) return { error: "IDENTITY_CONTEXT_REQUIRED", status: 401 };

  return { actor, companyId, action };
}

async function inventoryAudit(env, actor, actionCode, entityType, entityId, requestId) {
  await env.ONEX_DB.prepare(`
    INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId)
    VALUES (?, ?, ?, ?, ?)
  `).bind(actor, actionCode, entityType, String(entityId), requestId).run();
}

async function inventoryHealth(request, env) {
  const result = await env.ONEX_DB
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  return inventoryResponse({
    ok: true,
    service: "onex-workbench",
    storage: "cloudflare-d1",
    database: "onex-production",
    tables: result.results?.map((row) => row.name) ?? [],
  }, request, env);
}

async function inventoryListItems(request, env, auth) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim();
  const active = url.searchParams.get("active");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const activeFilter = active === "0" || active === "1" ? Number(active) : null;

  const result = await env.ONEX_DB.prepare(`
    SELECT id, companyId, code, name, description, itemType, unitCode, active,
           stockFlag, unitCost, revenueAccount, inventoryAccount, cogsAccount
    FROM items
    WHERE companyId = ?
      AND (? = '' OR code LIKE '%' || ? || '%' OR name LIKE '%' || ? || '%' OR description LIKE '%' || ? || '%')
      AND (? IS NULL OR active = ?)
    ORDER BY code
    LIMIT ?
  `).bind(auth.companyId, search, search, search, search, activeFilter, activeFilter, limit).all();

  return inventoryResponse({ rows: result.results ?? [], limit }, request, env);
}

async function inventoryGetItem(request, env, auth, id) {
  const item = await env.ONEX_DB.prepare(`
    SELECT id, companyId, code, name, description, itemType, unitCode, active,
           stockFlag, unitCost, revenueAccount, inventoryAccount, cogsAccount
    FROM items WHERE id = ? AND companyId = ? LIMIT 1
  `).bind(id, auth.companyId).first();
  if (!item) return inventoryErrorResponse("ITEM_NOT_FOUND", request, env, 404);

  const [units, balances] = await env.ONEX_DB.batch([
    env.ONEX_DB.prepare(`
    SELECT id, unitCode, unitName, conversionToBase, isBase, barcode, active
    FROM item_units WHERE itemId = ? ORDER BY isBase DESC, unitCode
  `).bind(id),
    env.ONEX_DB.prepare(`
      SELECT sb.warehouseId, w.code AS warehouseCode, w.name AS warehouseName,
             sb.quantity, sb.reservedQuantity, sb.unitCost, sb.totalCost, sb.versionNo
      FROM stock_balances sb JOIN warehouses w ON w.id = sb.warehouseId
      WHERE sb.itemId = ? AND w.companyId = ? ORDER BY w.code
    `).bind(id, auth.companyId),
  ]);
  return inventoryResponse({ ...item, units: units.results ?? [], balances: balances.results ?? [] }, request, env);
}

async function inventoryCreateItem(request, env, auth) {
  const body = await inventoryBodyJson(request);
  const code = inventoryRequiredText(body?.code, 80);
  const name = inventoryRequiredText(body?.name, 200);
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 1000) : name;
  const itemType = inventoryRequiredText(body?.itemType || "STOCK", 40);
  const unitCode = inventoryRequiredText(body?.unitCode || "EA", 30);
  const unitName = inventoryRequiredText(body?.unitName || unitCode, 80);
  const unitCost = inventoryDecimalText(body?.unitCost ?? "0", { min: 0 });
  const stockFlag = body?.stockFlag === undefined ? 1 : (body.stockFlag ? 1 : 0);

  if (!code || !name || !itemType || !unitCode || !unitName || !unitCost) {
    return inventoryErrorResponse("INVALID_ITEM_INPUT", request, env, 400);
  }

  const existing = await env.ONEX_DB.prepare(
    "SELECT id FROM items WHERE companyId = ? AND code = ? LIMIT 1",
  ).bind(auth.companyId, code).first();
  if (existing) return inventoryErrorResponse("ITEM_CODE_EXISTS", request, env, 409);

  const result = await env.ONEX_DB.prepare(`
    INSERT INTO items (companyId, code, name, description, itemType, unitCode, active, stockFlag, unitCost)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    RETURNING id, companyId, code, name, description, itemType, unitCode, active, stockFlag, unitCost
  `).bind(auth.companyId, code, name, description, itemType, unitCode, stockFlag, unitCost).first();

  if (!result) return inventoryErrorResponse("ITEM_CREATE_FAILED", request, env, 500);

  await env.ONEX_DB.batch([
    env.ONEX_DB.prepare(`
      INSERT INTO item_units (itemId, unitCode, unitName, conversionToBase, isBase)
      VALUES (?, ?, ?, '1.000000', 1)
    `).bind(result.id, unitCode, unitName),
    env.ONEX_DB.prepare(`
      INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId)
      VALUES (?, 'CREATE', 'INVENTORY_ITEM', ?, ?)
    `).bind(auth.actor, String(result.id), `INVT003:${code}`),
  ]);

  return inventoryResponse(result, request, env, 201);
}

async function inventoryUpdateItem(request, env, auth, id) {
  const body = await inventoryBodyJson(request);
  const current = await env.ONEX_DB.prepare(
    "SELECT id FROM items WHERE id = ? AND companyId = ? LIMIT 1",
  ).bind(id, auth.companyId).first();
  if (!current) return inventoryErrorResponse("ITEM_NOT_FOUND", request, env, 404);

  const fields = [];
  const values = [];
  if (body && body.name !== undefined) {
    const name = inventoryRequiredText(body.name, 200);
    if (!name) return inventoryErrorResponse("INVALID_ITEM_NAME", request, env, 400);
    fields.push("name = ?"); values.push(name);
  }
  if (body && body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 1000) return inventoryErrorResponse("INVALID_ITEM_DESCRIPTION", request, env, 400);
    fields.push("description = ?"); values.push(body.description.trim());
  }
  if (body && body.active !== undefined) {
    if (![0, 1, true, false].includes(body.active)) return inventoryErrorResponse("INVALID_ITEM_STATUS", request, env, 400);
    fields.push("active = ?"); values.push(body.active ? 1 : 0);
  }
  if (body && body.unitCost !== undefined) {
    const unitCost = inventoryDecimalText(body.unitCost, { min: 0 });
    if (!unitCost) return inventoryErrorResponse("INVALID_UNIT_COST", request, env, 400);
    fields.push("unitCost = ?"); values.push(unitCost);
  }
  if (!fields.length) return inventoryErrorResponse("NO_ITEM_CHANGES", request, env, 400);

  values.push(id, auth.companyId);
  const updated = await env.ONEX_DB.prepare(`
    UPDATE items SET ${fields.join(", ")} WHERE id = ? AND companyId = ?
    RETURNING id, companyId, code, name, description, itemType, unitCode, active, stockFlag, unitCost
  `).bind(...values).first();

  await inventoryAudit(env, auth.actor, "UPDATE", "INVENTORY_ITEM", id, `INVT003:${id}:UPDATE`);
  return inventoryResponse(updated, request, env);
}

async function inventoryListWarehouses(request, env, auth) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim();
  const active = url.searchParams.get("active");
  const activeFilter = active === "0" || active === "1" ? Number(active) : null;
  const result = await env.ONEX_DB.prepare(`
    SELECT id, companyId, code, name, active
    FROM warehouses
    WHERE companyId = ?
      AND (? = '' OR code LIKE '%' || ? || '%' OR name LIKE '%' || ? || '%')
      AND (? IS NULL OR active = ?)
    ORDER BY code
  `).bind(auth.companyId, search, search, search, activeFilter, activeFilter).all();
  return inventoryResponse({ rows: result.results ?? [] }, request, env);
}

async function inventoryGetWarehouse(request, env, auth, id) {
  const warehouse = await env.ONEX_DB.prepare(`
    SELECT id, companyId, code, name, active FROM warehouses
    WHERE id = ? AND companyId = ? LIMIT 1
  `).bind(id, auth.companyId).first();
  if (!warehouse) return inventoryErrorResponse("WAREHOUSE_NOT_FOUND", request, env, 404);
  const locations = await env.ONEX_DB.prepare(`
    SELECT id, warehouseId, code, name, active FROM warehouse_locations
    WHERE warehouseId = ? ORDER BY code
  `).bind(id).all();
  return inventoryResponse({ ...warehouse, locations: locations.results ?? [] }, request, env);
}

async function inventoryCreateWarehouse(request, env, auth) {
  const body = await inventoryBodyJson(request);
  const code = inventoryRequiredText(body?.code, 80);
  const name = inventoryRequiredText(body?.name, 200);
  if (!code || !name) return inventoryErrorResponse("INVALID_WAREHOUSE_INPUT", request, env, 400);

  const existing = await env.ONEX_DB.prepare(
    "SELECT id FROM warehouses WHERE companyId = ? AND code = ? LIMIT 1",
  ).bind(auth.companyId, code).first();
  if (existing) return inventoryErrorResponse("WAREHOUSE_CODE_EXISTS", request, env, 409);

  const result = await env.ONEX_DB.prepare(`
    INSERT INTO warehouses (companyId, code, name, active)
    VALUES (?, ?, ?, 1)
    RETURNING id, companyId, code, name, active
  `).bind(auth.companyId, code, name).first();
  if (!result) return inventoryErrorResponse("WAREHOUSE_CREATE_FAILED", request, env, 500);

  await inventoryAudit(env, auth.actor, "CREATE", "INVENTORY_WAREHOUSE", result.id, `INVT004:${code}`);
  return inventoryResponse(result, request, env, 201);
}

async function inventoryUpdateWarehouse(request, env, auth, id) {
  const body = await inventoryBodyJson(request);
  const current = await env.ONEX_DB.prepare(
    "SELECT id FROM warehouses WHERE id = ? AND companyId = ? LIMIT 1",
  ).bind(id, auth.companyId).first();
  if (!current) return inventoryErrorResponse("WAREHOUSE_NOT_FOUND", request, env, 404);

  const fields = [];
  const values = [];
  if (body && body.name !== undefined) {
    const name = inventoryRequiredText(body.name, 200);
    if (!name) return inventoryErrorResponse("INVALID_WAREHOUSE_NAME", request, env, 400);
    fields.push("name = ?"); values.push(name);
  }
  if (body && body.active !== undefined) {
    if (![0, 1, true, false].includes(body.active)) return inventoryErrorResponse("INVALID_WAREHOUSE_STATUS", request, env, 400);
    fields.push("active = ?"); values.push(body.active ? 1 : 0);
  }
  if (!fields.length) return inventoryErrorResponse("NO_WAREHOUSE_CHANGES", request, env, 400);

  values.push(id, auth.companyId);
  const updated = await env.ONEX_DB.prepare(`
    UPDATE warehouses SET ${fields.join(", ")} WHERE id = ? AND companyId = ?
    RETURNING id, companyId, code, name, active
  `).bind(...values).first();
  await inventoryAudit(env, auth.actor, "UPDATE", "INVENTORY_WAREHOUSE", id, `INVT004:${id}:UPDATE`);
  return inventoryResponse(updated, request, env);
}


function normalizeInventoryLine(line, index) {
  const itemId = inventoryParseId(line?.itemId);
  const quantity = inventoryDecimalText(line?.quantity, { min: 0.000001 });
  const unitCost = inventoryDecimalText(line?.unitCost ?? "0", { min: 0 });
  const unitCode = inventoryRequiredText(line?.unitCode || "EA", 30);
  if (!itemId || !quantity || !unitCost || !unitCode) return null;
  return {
    lineNo: index + 1,
    itemId,
    quantity,
    unitCost,
    unitCode,
    batchNo: line.batchNo ? inventoryRequiredText(line.batchNo, 120) : null,
    expireDate: line.expireDate ? inventoryRequiredText(line.expireDate, 40) : null,
    serialNo: line.serialNo ? inventoryRequiredText(line.serialNo, 160) : null,
    locationId: line.locationId ? inventoryParseId(line.locationId) : null,
  };
}

function documentWarehouses(docType, body) {
  const fromWarehouseId = body?.fromWarehouseId ? inventoryParseId(body.fromWarehouseId) : null;
  const toWarehouseId = body?.toWarehouseId ? inventoryParseId(body.toWarehouseId) : null;
  if (docType === "RECEIPT" && !toWarehouseId) return null;
  if (docType === "ISSUE" && !fromWarehouseId) return null;
  if (docType === "TRANSFER" && (!fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId)) return null;
  return { fromWarehouseId, toWarehouseId };
}

async function getInventoryDocument(request, env, auth, id) {
  const document = await env.ONEX_DB.prepare(`
    SELECT id, companyId, docNo, docType, status, fromWarehouseId, toWarehouseId,
           idempotencyKey, referenceNo, description, createdBy, createdAt, postedBy, postedAt
    FROM inventory_documents WHERE id = ? AND companyId = ? LIMIT 1
  `).bind(id, auth.companyId).first();
  if (!document) return inventoryErrorResponse("INVENTORY_DOCUMENT_NOT_FOUND", request, env, 404);
  const lines = await env.ONEX_DB.prepare(`
    SELECT id, lineNo, itemId, quantity, unitCost, unitCode, batchNo, expireDate, serialNo, locationId
    FROM inventory_document_lines WHERE documentId = ? ORDER BY lineNo
  `).bind(id).all();
  return inventoryResponse({ ...document, lines: lines.results ?? [] }, request, env);
}

async function listInventoryDocuments(request, env, auth) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const docType = url.searchParams.get("docType");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const result = await env.ONEX_DB.prepare(`
    SELECT id, companyId, docNo, docType, status, fromWarehouseId, toWarehouseId,
           referenceNo, description, createdBy, createdAt, postedBy, postedAt
    FROM inventory_documents
    WHERE companyId = ?
      AND (? = '' OR status = ?)
      AND (? = '' OR docType = ?)
    ORDER BY createdAt DESC, id DESC
    LIMIT ?
  `).bind(auth.companyId, status || "", status || "", docType || "", docType || "", limit).all();
  return inventoryResponse({ rows: result.results ?? [], limit }, request, env);
}

async function createInventoryDocument(request, env, auth) {
  const body = await inventoryBodyJson(request);
  const docType = inventoryRequiredText(body?.docType, 20)?.toUpperCase();
  const docNo = inventoryRequiredText(body?.docNo, 80);
  const idempotencyKey = inventoryRequiredText(body?.idempotencyKey || `INV:${docType}:${docNo}`, 180);
  const warehouses = documentWarehouses(docType, body);
  const rawLines = Array.isArray(body?.lines) ? body.lines : [];
  const lines = rawLines.map(normalizeInventoryLine);
  if (!['RECEIPT', 'ISSUE', 'TRANSFER'].includes(docType) || !docNo || !idempotencyKey || !warehouses || !rawLines.length || lines.some((line) => !line)) {
    return inventoryErrorResponse("INVALID_INVENTORY_DOCUMENT_INPUT", request, env, 400);
  }

  const existing = await env.ONEX_DB.prepare(`
    SELECT id, docNo, status FROM inventory_documents
    WHERE companyId = ? AND idempotencyKey = ? LIMIT 1
  `).bind(auth.companyId, idempotencyKey).first();
  if (existing) return inventoryResponse({ ...existing, alreadyExists: true }, request, env, 200);

  const warehouseIds = [warehouses.fromWarehouseId, warehouses.toWarehouseId].filter(Boolean);
  for (const warehouseId of warehouseIds) {
    const warehouse = await env.ONEX_DB.prepare(
      "SELECT id FROM warehouses WHERE id = ? AND companyId = ? AND active = 1 LIMIT 1",
    ).bind(warehouseId, auth.companyId).first();
    if (!warehouse) return inventoryErrorResponse("WAREHOUSE_NOT_FOUND_OR_INACTIVE", request, env, 400);
  }
  for (const line of lines) {
    const item = await env.ONEX_DB.prepare(
      "SELECT id FROM items WHERE id = ? AND companyId = ? AND active = 1 LIMIT 1",
    ).bind(line.itemId, auth.companyId).first();
    if (!item) return inventoryErrorResponse("ITEM_NOT_FOUND_OR_INACTIVE", request, env, 400, { itemId: line.itemId });
  }

  const document = await env.ONEX_DB.prepare(`
    INSERT INTO inventory_documents
      (companyId, docNo, docType, status, fromWarehouseId, toWarehouseId,
       idempotencyKey, referenceNo, description, createdBy)
    VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)
    RETURNING id, companyId, docNo, docType, status, fromWarehouseId, toWarehouseId, idempotencyKey
  `).bind(
    auth.companyId, docNo, docType, warehouses.fromWarehouseId, warehouses.toWarehouseId,
    idempotencyKey, body.referenceNo ? inventoryRequiredText(body.referenceNo, 120) : null,
    body.description ? inventoryRequiredText(body.description, 1000) : null, auth.actor,
  ).first();
  if (!document) return inventoryErrorResponse("INVENTORY_DOCUMENT_CREATE_FAILED", request, env, 500);

  const statements = lines.map((line) => env.ONEX_DB.prepare(`
    INSERT INTO inventory_document_lines
      (documentId, lineNo, itemId, quantity, unitCost, unitCode, batchNo, expireDate, serialNo, locationId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(document.id, line.lineNo, line.itemId, line.quantity, line.unitCost, line.unitCode, line.batchNo, line.expireDate, line.serialNo, line.locationId));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId)
    VALUES (?, 'CREATE', 'INVENTORY_DOCUMENT', ?, ?)
  `).bind(auth.actor, String(document.id), idempotencyKey));
  await env.ONEX_DB.batch(statements);
  return inventoryResponse({ ...document, lines }, request, env, 201);
}

async function postInventoryDocument(request, env, auth, id) {
  const document = await env.ONEX_DB.prepare(`
    SELECT id, companyId, docNo, docType, status, fromWarehouseId, toWarehouseId
    FROM inventory_documents WHERE id = ? AND companyId = ? LIMIT 1
  `).bind(id, auth.companyId).first();
  if (!document) return inventoryErrorResponse("INVENTORY_DOCUMENT_NOT_FOUND", request, env, 404);
  if (document.status !== "DRAFT") return inventoryErrorResponse("INVENTORY_DOCUMENT_NOT_DRAFT", request, env, 409);

  const linesResult = await env.ONEX_DB.prepare(`
    SELECT lineNo, itemId, quantity, unitCost, unitCode, batchNo, expireDate, serialNo, locationId
    FROM inventory_document_lines WHERE documentId = ? ORDER BY lineNo
  `).bind(id).all();
  const lines = linesResult.results ?? [];
  if (!lines.length) return inventoryErrorResponse("INVENTORY_DOCUMENT_HAS_NO_LINES", request, env, 400);

  const settings = await env.ONEX_DB.prepare(
    "SELECT allowNegativeStock, useBatchNo, useExpireDate, useSerialNo FROM inventory_settings WHERE id = 1",
  ).first();
  const allowNegative = Number(settings?.allowNegativeStock || 0) === 1;

  const sourceWarehouse = document.fromWarehouseId;
  const destinationWarehouse = document.toWarehouseId;
  const required = new Map();
  for (const line of lines) {
    const key = `${line.itemId}:${sourceWarehouse}`;
    if (sourceWarehouse) required.set(key, (required.get(key) || 0) + Number(line.quantity));
    if (settings?.useBatchNo && line.batchNo === null) return inventoryErrorResponse("BATCH_REQUIRED", request, env, 400);
    if (settings?.useExpireDate && line.expireDate === null) return inventoryErrorResponse("EXPIRY_REQUIRED", request, env, 400);
    if (settings?.useSerialNo && line.serialNo === null) return inventoryErrorResponse("SERIAL_REQUIRED", request, env, 400);
  }

  if (sourceWarehouse && !allowNegative) {
    for (const [key, needed] of required) {
      const [itemId, warehouseId] = key.split(":");
      const balance = await env.ONEX_DB.prepare(
        "SELECT quantity FROM stock_balances WHERE itemId = ? AND warehouseId = ? LIMIT 1",
      ).bind(Number(itemId), Number(warehouseId)).first();
      if (!balance || Number(balance.quantity) < needed) {
        return inventoryErrorResponse("INSUFFICIENT_STOCK", request, env, 409, { itemId: Number(itemId), warehouseId: Number(warehouseId), available: balance?.quantity || "0", required: needed.toFixed(6) });
      }
    }
  }

  const mapping = await env.ONEX_DB.prepare(`
    SELECT debitAccountCode, creditAccountCode
    FROM inventory_account_mappings
    WHERE companyId = ? AND docType = ? AND active = 1 LIMIT 1
  `).bind(auth.companyId, document.docType).first();
  if (!mapping) return inventoryErrorResponse("INVENTORY_ACCOUNT_MAPPING_NOT_FOUND", request, env, 409);

  const accountCodes = [...new Set([mapping.debitAccountCode, mapping.creditAccountCode])];
  const accountRows = {};
  for (const accountCode of accountCodes) {
    const account = await env.ONEX_DB.prepare(`
      SELECT code, name FROM accounts WHERE companyId = ? AND code = ? AND active = 1 LIMIT 1
    `).bind(auth.companyId, accountCode).first();
    if (!account) return inventoryErrorResponse("INVENTORY_ACCOUNT_NOT_FOUND", request, env, 409, { accountCode });
    accountRows[accountCode] = account;
  }
  const journalTotal = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0).toFixed(6);
  const journalNo = `INV-${document.docType}-${document.docNo}`;
  const statements = [env.ONEX_DB.prepare(`
    INSERT OR IGNORE INTO journal_entries
      (journalNo, sourceInventoryDocumentId, entryType, sourceRef, totalDebit, totalCredit, status, createdBy)
    VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?)
  `).bind(journalNo, id, `INVENTORY_${document.docType}`, document.docNo, journalTotal, journalTotal, auth.actor)];
  statements.push(env.ONEX_DB.prepare(`
    INSERT OR IGNORE INTO journal_entry_lines
      (journalNo, accountCode, debit, credit, description)
    SELECT journalNo, ?, ?, '0', ?
    FROM journal_entries WHERE sourceInventoryDocumentId = ?
  `).bind(mapping.debitAccountCode, journalTotal, `${document.docType} ${document.docNo}`, id));
  statements.push(env.ONEX_DB.prepare(`
    INSERT OR IGNORE INTO journal_entry_lines
      (journalNo, accountCode, debit, credit, description)
    SELECT journalNo, ?, '0', ?, ?
    FROM journal_entries WHERE sourceInventoryDocumentId = ?
  `).bind(mapping.creditAccountCode, journalTotal, `${document.docType} ${document.docNo}`, id));
  for (const line of lines) {
    const qty = line.quantity;
    const cost = line.unitCost;
    const source = sourceWarehouse;
    const destination = destinationWarehouse;
    if (source) {
      statements.push(env.ONEX_DB.prepare(`
        UPDATE stock_balances
        SET quantity = printf('%.6f', CAST(quantity AS REAL) - CAST(? AS REAL)),
            totalCost = printf('%.6f', (CAST(quantity AS REAL) - CAST(? AS REAL)) * CAST(unitCost AS REAL)),
            versionNo = versionNo + 1
        WHERE itemId = ? AND warehouseId = ? AND (? = 1 OR CAST(quantity AS REAL) >= CAST(? AS REAL))
      `).bind(qty, qty, line.itemId, source, allowNegative ? 1 : 0, qty));
    }
    if (destination) {
      statements.push(env.ONEX_DB.prepare(`
        INSERT INTO stock_balances (itemId, warehouseId, quantity, unitCost, totalCost, reservedQuantity, versionNo)
        VALUES (?, ?, ?, ?, printf('%.6f', CAST(? AS REAL) * CAST(? AS REAL)), '0', 1)
        ON CONFLICT(itemId, warehouseId) DO UPDATE SET
          quantity = printf('%.6f', CAST(stock_balances.quantity AS REAL) + CAST(excluded.quantity AS REAL)),
          unitCost = excluded.unitCost,
          totalCost = printf('%.6f', (CAST(stock_balances.quantity AS REAL) + CAST(excluded.quantity AS REAL)) * CAST(excluded.unitCost AS REAL)),
          versionNo = stock_balances.versionNo + 1
      `).bind(line.itemId, destination, qty, cost, qty, cost));
    }
    if (source) {
      statements.push(env.ONEX_DB.prepare(`
        INSERT INTO stock_movements
          (itemId, warehouseId, inventoryDocumentId, movementType, quantityIn, quantityOut, unitCost, totalCost, balanceAfter, createdBy)
        SELECT ?, ?, ?, ?, '0', ?, ?, printf('%.6f', CAST(? AS REAL) * CAST(? AS REAL)), quantity, ?
        FROM stock_balances WHERE itemId = ? AND warehouseId = ?
      `).bind(line.itemId, source, id, document.docType === 'TRANSFER' ? 'TRANSFER_OUT' : 'ISSUE', qty, cost, qty, cost, auth.actor, line.itemId, source));
    }
    if (destination) {
      statements.push(env.ONEX_DB.prepare(`
        INSERT INTO stock_movements
          (itemId, warehouseId, inventoryDocumentId, movementType, quantityIn, quantityOut, unitCost, totalCost, balanceAfter, createdBy)
        SELECT ?, ?, ?, ?, ?, '0', ?, printf('%.6f', CAST(? AS REAL) * CAST(? AS REAL)), quantity, ?
        FROM stock_balances WHERE itemId = ? AND warehouseId = ?
      `).bind(line.itemId, destination, id, document.docType === 'TRANSFER' ? 'TRANSFER_IN' : 'RECEIPT', qty, cost, qty, cost, auth.actor, line.itemId, destination));
    }
    if (line.batchNo && destination) {
      statements.push(env.ONEX_DB.prepare(`
        INSERT INTO stock_batches (itemId, warehouseId, batchNo, expireDate, quantity, unitCost)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(itemId, warehouseId, batchNo) DO UPDATE SET quantity = printf('%.6f', CAST(stock_batches.quantity AS REAL) + CAST(excluded.quantity AS REAL)), expireDate = excluded.expireDate, unitCost = excluded.unitCost
      `).bind(line.itemId, destination, line.batchNo, line.expireDate, qty, cost));
    }
  }
  statements.push(env.ONEX_DB.prepare(`
    UPDATE inventory_documents
    SET status = 'POSTED', postedBy = ?, postedAt = CURRENT_TIMESTAMP,
        journalNo = (SELECT journalNo FROM journal_entries WHERE sourceInventoryDocumentId = ? LIMIT 1)
    WHERE id = ? AND companyId = ? AND status = 'DRAFT'
  `).bind(auth.actor, id, id, auth.companyId));
  statements.push(env.ONEX_DB.prepare(`
    INSERT INTO audit_events (actor, actionCode, entityType, entityId, requestId)
    VALUES (?, 'POST', 'INVENTORY_DOCUMENT', ?, ?)
  `).bind(auth.actor, String(id), `POST:${document.docNo}`));
  await env.ONEX_DB.batch(statements);
  return inventoryResponse({ id, docNo: document.docNo, status: "POSTED", docType: document.docType }, request, env);
}

async function listInventoryMovements(request, env, auth) {
  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId") ? inventoryParseId(url.searchParams.get("itemId")) : null;
  const warehouseId = url.searchParams.get("warehouseId") ? inventoryParseId(url.searchParams.get("warehouseId")) : null;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);
  const result = await env.ONEX_DB.prepare(`
    SELECT sm.id, sm.itemId, sm.warehouseId, sm.sourceInvoiceId, sm.inventoryDocumentId, sm.movementType,
           sm.quantityIn, sm.quantityOut, sm.unitCost, sm.totalCost, sm.balanceAfter,
           sm.createdBy, sm.createdAt,
           COALESCE(d.docNo, si.docNo, pi.docNo, sm.reference) AS docNo,
           COALESCE(d.docType, CASE WHEN si.id IS NOT NULL THEN 'SALES_INVOICE' WHEN pi.id IS NOT NULL THEN 'PURCHASE_INVOICE' END) AS docType
    FROM stock_movements sm
    LEFT JOIN inventory_documents d ON d.id = sm.inventoryDocumentId
    LEFT JOIN invoices si ON si.id = sm.sourceInvoiceId
    LEFT JOIN purchase_invoices pi ON pi.docNo = sm.reference
    JOIN items i ON i.id = sm.itemId
    WHERE i.companyId = ?
      AND (? IS NULL OR sm.itemId = ?)
      AND (? IS NULL OR sm.warehouseId = ?)
    ORDER BY sm.createdAt DESC, sm.id DESC LIMIT ?
  `).bind(auth.companyId, itemId, itemId, warehouseId, warehouseId, limit).all();
  return inventoryResponse({ rows: result.results ?? [], limit }, request, env);
}

async function inventoryListCounts(request, env, auth) {
  const url = new URL(request.url); const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const result = await env.ONEX_DB.prepare(`SELECT id, countNo, warehouseId, countMode, status, countedAt, postedAt, actor, notes FROM inventory_counts WHERE warehouseId IN (SELECT id FROM warehouses WHERE companyId = ?) ORDER BY countedAt DESC, id DESC LIMIT ?`).bind(auth.companyId, limit).all();
  return inventoryResponse({ rows: result.results ?? [], limit }, request, env);
}

async function inventoryGetCount(request, env, auth, id) {
  const count = await env.ONEX_DB.prepare(`SELECT c.* FROM inventory_counts c JOIN warehouses w ON w.id = c.warehouseId WHERE c.id = ? AND w.companyId = ? LIMIT 1`).bind(id, auth.companyId).first();
  if (!count) return inventoryErrorResponse("INVENTORY_COUNT_NOT_FOUND", request, env, 404);
  const lines = await env.ONEX_DB.prepare(`SELECT l.*, i.code, COALESCE(NULLIF(i.description, ''), i.name) AS itemName FROM inventory_count_lines l JOIN items i ON i.id = l.itemId WHERE l.countId = ? ORDER BY l.id`).bind(id).all();
  return inventoryResponse({ ...count, lines: lines.results ?? [] }, request, env);
}

async function inventoryCreateCount(request, env, auth) {
  const body = await inventoryBodyJson(request); const countNo = inventoryRequiredText(body?.countNo, 80); const warehouseId = inventoryParseId(body?.warehouseId); const mode = body?.countMode === "CYCLE" ? "CYCLE" : body?.countMode === "PERIODIC" ? "PERIODIC" : null; const lines = Array.isArray(body?.lines) ? body.lines : [];
  if (!countNo || !warehouseId || !mode || !lines.length || lines.length > 500) return inventoryErrorResponse("INVALID_INVENTORY_COUNT_INPUT", request, env, 400);
  const warehouse = await env.ONEX_DB.prepare("SELECT id FROM warehouses WHERE id = ? AND companyId = ? AND active = 1 LIMIT 1").bind(warehouseId, auth.companyId).first(); if (!warehouse) return inventoryErrorResponse("WAREHOUSE_NOT_ACTIVE", request, env, 400);
  const normalized = lines.map((line) => ({ itemId: inventoryParseId(line?.itemId), countedQuantity: inventoryDecimalText(line?.countedQuantity, { min: 0 }) })).filter((line) => line.itemId && line.countedQuantity);
  if (normalized.length !== lines.length || new Set(normalized.map((line) => line.itemId)).size !== normalized.length) return inventoryErrorResponse("INVALID_INVENTORY_COUNT_LINE", request, env, 400);
  const duplicate = await env.ONEX_DB.prepare("SELECT id FROM inventory_counts WHERE countNo = ? LIMIT 1").bind(countNo).first(); if (duplicate) return inventoryErrorResponse("DUPLICATE_COUNT_NUMBER", request, env, 409);
  const created = await env.ONEX_DB.prepare("INSERT INTO inventory_counts(countNo,warehouseId,countMode,actor,notes) VALUES(?,?,?,?,?) RETURNING id,countNo,warehouseId,countMode,status,countedAt").bind(countNo, warehouseId, mode, auth.actor, typeof body.notes === "string" ? body.notes.slice(0, 500) : null).first(); if (!created) return inventoryErrorResponse("INVENTORY_COUNT_CREATE_FAILED", request, env, 500);
  const statements = [];
  for (const line of normalized) { const item = await env.ONEX_DB.prepare("SELECT id, unitCost, inventoryAccount FROM items WHERE id = ? AND companyId = ? LIMIT 1").bind(line.itemId, auth.companyId).first(); if (!item) return inventoryErrorResponse("ITEM_NOT_FOUND", request, env, 400); const balance = await env.ONEX_DB.prepare("SELECT quantity, unitCost FROM stock_balances WHERE itemId = ? AND warehouseId = ? LIMIT 1").bind(line.itemId, warehouseId).first(); const systemQuantity = Number(balance?.quantity || 0); const unitCost = Number(balance?.unitCost || item.unitCost || 0); const countedQuantity = Number(line.countedQuantity); statements.push(env.ONEX_DB.prepare("INSERT INTO inventory_count_lines(countId,itemId,systemQuantity,countedQuantity,unitCost,varianceQuantity,varianceValue) VALUES(?,?,?,?,?,?,?)").bind(created.id, line.itemId, systemQuantity.toFixed(6), countedQuantity.toFixed(6), unitCost.toFixed(6), (countedQuantity - systemQuantity).toFixed(6), ((countedQuantity - systemQuantity) * unitCost).toFixed(6))); }
  statements.push(env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind(auth.actor, "CREATE", "INVENTORY_COUNT", String(created.id), `COUNT:${countNo}`)); await env.ONEX_DB.batch(statements); return inventoryResponse({ ...created, lineCount: normalized.length }, request, env, 201);
}

async function inventoryPostCount(request, env, auth, id) {
  const count = await env.ONEX_DB.prepare("SELECT c.* FROM inventory_counts c JOIN warehouses w ON w.id = c.warehouseId WHERE c.id = ? AND w.companyId = ? LIMIT 1").bind(id, auth.companyId).first(); if (!count) return inventoryErrorResponse("INVENTORY_COUNT_NOT_FOUND", request, env, 404); if (count.status !== "DRAFT") return inventoryErrorResponse("INVENTORY_COUNT_NOT_POSTABLE", request, env, 409);
  const lines = await env.ONEX_DB.prepare("SELECT l.*, i.code, i.inventoryAccount FROM inventory_count_lines l JOIN items i ON i.id = l.itemId WHERE l.countId = ? ORDER BY l.id").bind(id).all(); const statements = []; const journalLines = []; let totalVariance = 0;
  for (const line of lines.results || []) { const counted = Number(line.countedQuantity); const system = Number(line.systemQuantity); const unitCost = Number(line.unitCost); const variance = counted - system; const value = variance * unitCost; totalVariance += value; if (!variance) continue; const current = await env.ONEX_DB.prepare("SELECT quantity,totalCost,unitCost,versionNo FROM stock_balances WHERE itemId = ? AND warehouseId = ? LIMIT 1").bind(line.itemId, count.warehouseId).first(); const totalCost = counted * unitCost; if (current) statements.push(env.ONEX_DB.prepare("UPDATE stock_balances SET quantity=?,totalCost=?,unitCost=?,versionNo=versionNo+1 WHERE itemId=? AND warehouseId=?").bind(counted.toFixed(6), totalCost.toFixed(6), unitCost.toFixed(6), line.itemId, count.warehouseId)); else statements.push(env.ONEX_DB.prepare("INSERT INTO stock_balances(itemId,warehouseId,quantity,totalCost,unitCost,versionNo) VALUES(?,?,?,?,?,1)").bind(line.itemId, count.warehouseId, counted.toFixed(6), totalCost.toFixed(6), unitCost.toFixed(6))); statements.push(env.ONEX_DB.prepare("INSERT INTO stock_movements(itemId,warehouseId,movementType,quantityIn,quantityOut,unitCost,totalCost,balanceAfter,createdBy) VALUES(?,?,?,?,?,?,?,?,?)").bind(line.itemId, count.warehouseId, variance > 0 ? "INVENTORY_GAIN" : "INVENTORY_LOSS", variance > 0 ? variance.toFixed(6) : "0", variance < 0 ? Math.abs(variance).toFixed(6) : "0", unitCost.toFixed(6), Math.abs(value).toFixed(6), counted.toFixed(6), auth.actor)); if (variance > 0) journalLines.push({ accountCode: line.inventoryAccount || "1300", debit: value, credit: 0, description: `زيادة جرد ${line.code}` }, { accountCode: "4300", debit: 0, credit: value, description: "أرباح فروقات الجرد" }); else journalLines.push({ accountCode: "5300", debit: Math.abs(value), credit: 0, description: "خسائر فروقات الجرد" }, { accountCode: line.inventoryAccount || "1300", debit: 0, credit: Math.abs(value), description: `نقص جرد ${line.code}` }); }
  if (journalLines.length) { const debit = journalLines.reduce((sum, line) => sum + line.debit, 0).toFixed(6); const credit = journalLines.reduce((sum, line) => sum + line.credit, 0).toFixed(6); const journalNo = `COUNT-${count.countNo}`; statements.push(env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,totalDebit,totalCredit,status,sourceInventoryDocumentId,createdBy) VALUES(?,?,?,?,?,?,?)").bind(journalNo, "INVENTORY_COUNT", debit, credit, "POSTED", id, auth.actor)); for (const line of journalLines) statements.push(env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalEntryId,accountCode,accountName,description,debit,credit) VALUES((SELECT id FROM journal_entries WHERE journalNo=?),?,?,?,?,?)").bind(journalNo, line.accountCode, null, line.description, line.debit.toFixed(6), line.credit.toFixed(6))); }
  statements.push(env.ONEX_DB.prepare("UPDATE inventory_counts SET status='POSTED',postedAt=CURRENT_TIMESTAMP WHERE id=? AND status='DRAFT'").bind(id)); statements.push(env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind(auth.actor, "POST", "INVENTORY_COUNT", String(id), `POST-COUNT:${count.countNo}`)); await env.ONEX_DB.batch(statements); return inventoryResponse({ id, countNo: count.countNo, status: "POSTED", totalVariance: totalVariance.toFixed(6) }, request, env);
}


async function inventoryDispatch(request, env, path, auth) {
  const itemMatch = path.match(/^\/api\/inventory\/items(?:\/(\d+))?$/);
  if (itemMatch) {
    const id = itemMatch[1] ? inventoryParseId(itemMatch[1]) : null;
    if (request.method === "GET") return id ? inventoryGetItem(request, env, auth, id) : inventoryListItems(request, env, auth);
    if (request.method === "POST" && !id) return inventoryCreateItem(request, env, auth);
    if (request.method === "PATCH" && id) return inventoryUpdateItem(request, env, auth, id);
    return inventoryErrorResponse("METHOD_NOT_ALLOWED", request, env, 405);
  }

  const documentMatch = path.match(/^\/api\/inventory\/documents(?:\/(\d+))?(\/post)?$/);
  if (documentMatch) {
    const id = documentMatch[1] ? inventoryParseId(documentMatch[1]) : null;
    if (documentMatch[2] === '/post' && request.method === 'POST' && id) return postInventoryDocument(request, env, auth, id);
    if (request.method === 'GET' && id) return getInventoryDocument(request, env, auth, id);
    if (request.method === 'GET' && !id) return listInventoryDocuments(request, env, auth);
    if (request.method === 'POST' && !id) return createInventoryDocument(request, env, auth);
    return inventoryErrorResponse("METHOD_NOT_ALLOWED", request, env, 405);
  }

  if (path === '/api/inventory/movements' && request.method === 'GET') return listInventoryMovements(request, env, auth);

  const countMatch = path.match(/^\/api\/inventory\/counts(?:\/(\d+))?(\/post)?$/);
  if (countMatch) {
    const id = countMatch[1] ? inventoryParseId(countMatch[1]) : null;
    if (countMatch[2] === '/post' && request.method === 'POST' && id) return inventoryPostCount(request, env, auth, id);
    if (request.method === 'GET' && id) return inventoryGetCount(request, env, auth, id);
    if (request.method === 'GET' && !id) return inventoryListCounts(request, env, auth);
    if (request.method === 'POST' && !id) return inventoryCreateCount(request, env, auth);
    return inventoryErrorResponse("METHOD_NOT_ALLOWED", request, env, 405);
  }

  const warehouseMatch = path.match(/^\/api\/inventory\/warehouses(?:\/(\d+))?$/);
  if (warehouseMatch) {
    const id = warehouseMatch[1] ? inventoryParseId(warehouseMatch[1]) : null;
    if (request.method === "GET") return id ? inventoryGetWarehouse(request, env, auth, id) : inventoryListWarehouses(request, env, auth);
    if (request.method === "POST" && !id) return inventoryCreateWarehouse(request, env, auth);
    if (request.method === "PATCH" && id) return inventoryUpdateWarehouse(request, env, auth, id);
    return inventoryErrorResponse("METHOD_NOT_ALLOWED", request, env, 405);
  }

  return null;
}



const cloudJson = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-onex-deployment": "cloudflare-worker", "access-control-allow-origin": "*" } });
const readBody = async (request) => { try { return await request.json(); } catch { return {}; } };
const limitOf = (url) => Math.min(Number(url.searchParams.get("limit") || 100), 200);
async function ensurePartyAccount(env, table, id) {
  const party = await env.ONEX_DB.prepare(`SELECT id, companyId, legalName, currencyCode, accountId FROM ${table} WHERE id=? LIMIT 1`).bind(id).first();
  if (!party || party.accountId) return party?.accountId || null;
  const prefix = table === "customers" ? "1210-" : "2100-";
  const type = table === "customers" ? "ASSET" : "LIABILITY";
  const parent = table === "customers" ? "1210" : "2100";
  const code = `${prefix}${String(id).padStart(4, "0")}`;
  await env.ONEX_DB.prepare("INSERT OR IGNORE INTO accounts(companyId,code,name,accountType,parentCode,currencyCode,active) VALUES(?,?,?,?,?,?,1)").bind(party.companyId, code, party.legalName, type, parent, party.currencyCode || "SAR").run();
  const account = await env.ONEX_DB.prepare("SELECT id FROM accounts WHERE companyId=? AND code=? LIMIT 1").bind(party.companyId, code).first();
  if (account?.id) await env.ONEX_DB.prepare(`UPDATE ${table} SET accountId=? WHERE id=?`).bind(account.id, id).run();
  return account?.id || null;
}

async function api(request, env, url) {
  const writeRoute = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  const publicWrite = url.pathname === "/api/cloud/auth/logout";
  if (writeRoute && !publicWrite && !request.headers.get("x-onex-actor")?.trim()) return cloudJson({ error: "CLOUD_ACTOR_REQUIRED" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,authorization" } });
  if (url.pathname === "/api/cloud/persistent-test-suite" && request.method === "POST") {
    const existing = await env.ONEX_DB.prepare("SELECT id FROM customers WHERE code = 'TEST-PERSIST-CUST-001' LIMIT 1").first();
    if (existing) return cloudJson({ ok: true, alreadyExists: true, message: "Persistent test suite already exists" });
    const statements = [
      env.ONEX_DB.prepare("INSERT INTO items(companyId,code,name,itemType,unitCode,active) VALUES(1,'TEST-PERSIST-ITEM-001','صنف اختبار دائم','STOCK','EA',1)"),
      env.ONEX_DB.prepare("INSERT INTO customers(companyId,code,legalName,currencyCode,status) VALUES(1,'TEST-PERSIST-CUST-001','عميل اختبار دائم','SAR','ACTIVE')"),
      env.ONEX_DB.prepare("INSERT INTO suppliers(companyId,code,legalName,currencyCode,status) VALUES(1,'TEST-PERSIST-SUP-001','مورد اختبار دائم','SAR','ACTIVE')"),
      env.ONEX_DB.prepare("INSERT INTO warehouses(companyId,code,name,active) VALUES(1,'TEST-PERSIST-WH-001','مخزن اختبار دائم',1)"),
      env.ONEX_DB.prepare("INSERT INTO branches(companyId,code,name,active) VALUES(1,'TEST-PERSIST-BR-001','فرع اختبار دائم',1)"),
      env.ONEX_DB.prepare("INSERT INTO fiscal_periods(companyId,code,startsOn,endsOn,status) VALUES(1,'TEST-PERSIST-FY-2026','2026-01-01 00:00:00','2026-12-31 23:59:59','OPEN')"),
      env.ONEX_DB.prepare("INSERT INTO payment_vouchers(voucherNo,direction,partyType,partyId,currencyCode,exchangeRate,amount,localAmount,accountCode,reference,notes,status,createdBy) VALUES('TEST-PERSIST-RECEIPT-001','RECEIPT','CUSTOMER',(SELECT id FROM customers WHERE code='TEST-PERSIST-CUST-001'),'SAR','1','500.00','500.00','1100','TEST-PERSIST-CUST-001','سند قبض اختبار دائم','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO payment_vouchers(voucherNo,direction,partyType,partyId,currencyCode,exchangeRate,amount,localAmount,accountCode,reference,notes,status,createdBy) VALUES('TEST-PERSIST-PAYMENT-001','PAYMENT','SUPPLIER',(SELECT id FROM suppliers WHERE code='TEST-PERSIST-SUP-001'),'SAR','1','250.00','250.00','1100','TEST-PERSIST-SUP-001','سند صرف اختبار دائم','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO invoices(docNo,customerId,warehouseId,currencyCode,subtotal,taxTotal,grandTotal,status,idempotencyKey,sourceForm,createdBy,paymentMethod,paidAmount,remainingAmount) VALUES('TEST-PERSIST-SALE-CASH-001',(SELECT id FROM customers WHERE code='TEST-PERSIST-CUST-001'),(SELECT id FROM warehouses WHERE code='TEST-PERSIST-WH-001'),'SAR','200.000000','30.000000','230.000000','POSTED','TEST-PERSIST-SALE-CASH-001','ARST004','persistent-test','CASH','230.000000','0.000000')"),
      env.ONEX_DB.prepare("INSERT INTO invoice_lines(invoiceId,itemId,quantity,unitPrice,taxAmount,lineTotal) VALUES((SELECT id FROM invoices WHERE docNo='TEST-PERSIST-SALE-CASH-001'),(SELECT id FROM items WHERE code='TEST-PERSIST-ITEM-001'),'2','100.000000','30.000000','230.000000')"),
      env.ONEX_DB.prepare("INSERT INTO invoices(docNo,customerId,warehouseId,currencyCode,subtotal,taxTotal,grandTotal,status,idempotencyKey,sourceForm,createdBy,paymentMethod,paidAmount,remainingAmount) VALUES('TEST-PERSIST-SALE-CREDIT-001',(SELECT id FROM customers WHERE code='TEST-PERSIST-CUST-001'),(SELECT id FROM warehouses WHERE code='TEST-PERSIST-WH-001'),'SAR','300.000000','45.000000','345.000000','POSTED','TEST-PERSIST-SALE-CREDIT-001','ARST004','persistent-test','CREDIT','0.000000','345.000000')"),
      env.ONEX_DB.prepare("INSERT INTO invoice_lines(invoiceId,itemId,quantity,unitPrice,taxAmount,lineTotal) VALUES((SELECT id FROM invoices WHERE docNo='TEST-PERSIST-SALE-CREDIT-001'),(SELECT id FROM items WHERE code='TEST-PERSIST-ITEM-001'),'3','100.000000','45.000000','345.000000')"),
      env.ONEX_DB.prepare("INSERT INTO invoices(docNo,customerId,warehouseId,currencyCode,subtotal,taxTotal,grandTotal,status,idempotencyKey,sourceForm,createdBy,paymentMethod,paidAmount,remainingAmount,notes) VALUES('TEST-PERSIST-SALE-RETURN-001',(SELECT id FROM customers WHERE code='TEST-PERSIST-CUST-001'),(SELECT id FROM warehouses WHERE code='TEST-PERSIST-WH-001'),'SAR','-100.000000','-15.000000','-115.000000','POSTED','TEST-PERSIST-SALE-RETURN-001','AR_RETURN','persistent-test','CREDIT','0.000000','-115.000000','مرتجع مبيعات مرتبط بالفاتورة الآجلة TEST-PERSIST-SALE-CREDIT-001')"),
      env.ONEX_DB.prepare("INSERT INTO invoice_lines(invoiceId,itemId,quantity,unitPrice,taxAmount,lineTotal) VALUES((SELECT id FROM invoices WHERE docNo='TEST-PERSIST-SALE-RETURN-001'),(SELECT id FROM items WHERE code='TEST-PERSIST-ITEM-001'),'-1','100.000000','-15.000000','-115.000000')"),
      env.ONEX_DB.prepare("INSERT INTO purchase_invoices(docNo,supplierId,warehouseId,currencyCode,subtotal,taxTotal,grandTotal,status,idempotencyKey,createdBy,notes) VALUES('TEST-PERSIST-PURCHASE-001',(SELECT id FROM suppliers WHERE code='TEST-PERSIST-SUP-001'),(SELECT id FROM warehouses WHERE code='TEST-PERSIST-WH-001'),'SAR','400.000000','0.000000','400.000000','POSTED','TEST-PERSIST-PURCHASE-001','persistent-test','فاتورة مشتريات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO purchase_lines(purchaseInvoiceId,itemId,quantity,unitPrice,taxAmount,lineTotal) VALUES((SELECT id FROM purchase_invoices WHERE docNo='TEST-PERSIST-PURCHASE-001'),(SELECT id FROM items WHERE code='TEST-PERSIST-ITEM-001'),'5','80.000000','0.000000','400.000000')"),
      env.ONEX_DB.prepare("INSERT INTO purchase_invoices(docNo,supplierId,warehouseId,currencyCode,subtotal,taxTotal,grandTotal,status,idempotencyKey,createdBy,notes) VALUES('TEST-PERSIST-PURCHASE-RETURN-001',(SELECT id FROM suppliers WHERE code='TEST-PERSIST-SUP-001'),(SELECT id FROM warehouses WHERE code='TEST-PERSIST-WH-001'),'SAR','-160.000000','0.000000','-160.000000','POSTED','TEST-PERSIST-PURCHASE-RETURN-001','persistent-test','مرتجع مشتريات مرتبط بالفاتورة TEST-PERSIST-PURCHASE-001')"),
      env.ONEX_DB.prepare("INSERT INTO purchase_lines(purchaseInvoiceId,itemId,quantity,unitPrice,taxAmount,lineTotal) VALUES((SELECT id FROM purchase_invoices WHERE docNo='TEST-PERSIST-PURCHASE-RETURN-001'),(SELECT id FROM items WHERE code='TEST-PERSIST-ITEM-001'),'-2','80.000000','0.000000','-160.000000')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,sourceRef,totalDebit,totalCredit,status,createdBy) VALUES('TEST-PERSIST-JV-RECEIPT-001','RECEIPT','TEST-PERSIST-RECEIPT-001','500.000000','500.000000','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-RECEIPT-001','1100','500.000000','0','سند قبض اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-RECEIPT-001','1210','0','500.000000','سند قبض اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,sourceRef,totalDebit,totalCredit,status,createdBy) VALUES('TEST-PERSIST-JV-PAYMENT-001','PAYMENT','TEST-PERSIST-PAYMENT-001','250.000000','250.000000','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-PAYMENT-001','2100','250.000000','0','سند صرف اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-PAYMENT-001','1100','0','250.000000','سند صرف اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,sourceRef,sourceInvoiceId,totalDebit,totalCredit,status,createdBy) VALUES('TEST-PERSIST-JV-SALE-CASH-001','SALE_CASH','TEST-PERSIST-SALE-CASH-001',(SELECT id FROM invoices WHERE docNo='TEST-PERSIST-SALE-CASH-001'),'230.000000','230.000000','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-CASH-001','1100','230.000000','0','مبيعات نقدية اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-CASH-001','4100','0','200.000000','مبيعات نقدية اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-CASH-001','2200','0','30.000000','ضريبة مبيعات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,sourceRef,sourceInvoiceId,totalDebit,totalCredit,status,createdBy) VALUES('TEST-PERSIST-JV-SALE-CREDIT-001','SALE_CREDIT','TEST-PERSIST-SALE-CREDIT-001',(SELECT id FROM invoices WHERE docNo='TEST-PERSIST-SALE-CREDIT-001'),'345.000000','345.000000','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-CREDIT-001','1210','345.000000','0','مبيعات آجلة اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-CREDIT-001','4100','0','300.000000','مبيعات آجلة اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-CREDIT-001','2200','0','45.000000','ضريبة مبيعات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,sourceRef,totalDebit,totalCredit,status,createdBy) VALUES('TEST-PERSIST-JV-SALE-RETURN-001','SALE_RETURN','TEST-PERSIST-SALE-RETURN-001','115.000000','115.000000','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-RETURN-001','4200','100.000000','0','مرتجع مبيعات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-RETURN-001','2200','15.000000','0','ضريبة مرتجع مبيعات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-SALE-RETURN-001','1210','0','115.000000','مرتجع مبيعات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,sourceRef,totalDebit,totalCredit,status,createdBy) VALUES('TEST-PERSIST-JV-PURCHASE-001','PURCHASE','TEST-PERSIST-PURCHASE-001','400.000000','400.000000','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-PURCHASE-001','1300','400.000000','0','مشتريات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-PURCHASE-001','2100','0','400.000000','مشتريات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,sourceRef,totalDebit,totalCredit,status,createdBy) VALUES('TEST-PERSIST-JV-PURCHASE-RETURN-001','PURCHASE_RETURN','TEST-PERSIST-PURCHASE-RETURN-001','160.000000','160.000000','POSTED','persistent-test')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-PURCHASE-RETURN-001','2100','160.000000','0','مرتجع مشتريات اختبار دائم')"),
      env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,debit,credit,description) VALUES('TEST-PERSIST-JV-PURCHASE-RETURN-001','1300','0','160.000000','مرتجع مشتريات اختبار دائم')"),
    ];
    for (const [entityType, entityId, requestId] of [
      ["MASTER_ITEM", "TEST-PERSIST-ITEM-001", "TEST-PERSIST:MASTER:ITEM"], ["MASTER_CUSTOMER", "TEST-PERSIST-CUST-001", "TEST-PERSIST:MASTER:CUSTOMER"], ["MASTER_SUPPLIER", "TEST-PERSIST-SUP-001", "TEST-PERSIST:MASTER:SUPPLIER"], ["MASTER_WAREHOUSE", "TEST-PERSIST-WH-001", "TEST-PERSIST:MASTER:WAREHOUSE"], ["MASTER_BRANCH", "TEST-PERSIST-BR-001", "TEST-PERSIST:MASTER:BRANCH"], ["MASTER_FISCAL_YEAR", "TEST-PERSIST-FY-2026", "TEST-PERSIST:MASTER:FISCAL"], ["RECEIPT_VOUCHER", "TEST-PERSIST-RECEIPT-001", "TEST-PERSIST:RECEIPT"], ["PAYMENT_VOUCHER", "TEST-PERSIST-PAYMENT-001", "TEST-PERSIST:PAYMENT"], ["SALES_CASH", "TEST-PERSIST-SALE-CASH-001", "TEST-PERSIST:SALE:CASH"], ["SALES_CREDIT", "TEST-PERSIST-SALE-CREDIT-001", "TEST-PERSIST:SALE:CREDIT"], ["SALES_RETURN", "TEST-PERSIST-SALE-RETURN-001", "TEST-PERSIST:SALE:RETURN"], ["PURCHASE", "TEST-PERSIST-PURCHASE-001", "TEST-PERSIST:PURCHASE"], ["PURCHASE_RETURN", "TEST-PERSIST-PURCHASE-RETURN-001", "TEST-PERSIST:PURCHASE:RETURN"], ["JOURNAL_SET", "TEST-PERSIST-JV-RECEIPT-001..TEST-PERSIST-JV-PURCHASE-RETURN-001", "TEST-PERSIST:JOURNALS"],
    ]) statements.push(env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES('persistent-test','CREATE',?,?,?)").bind(entityType, entityId, requestId));
    const result = await env.ONEX_DB.batch(statements);
    return cloudJson({ ok: true, persistent: true, atomicStatements: result.length, documents: ["TEST-PERSIST-RECEIPT-001", "TEST-PERSIST-PAYMENT-001", "TEST-PERSIST-SALE-CASH-001", "TEST-PERSIST-SALE-CREDIT-001", "TEST-PERSIST-SALE-RETURN-001", "TEST-PERSIST-PURCHASE-001", "TEST-PERSIST-PURCHASE-RETURN-001"], journals: ["TEST-PERSIST-JV-RECEIPT-001", "TEST-PERSIST-JV-PAYMENT-001", "TEST-PERSIST-JV-SALE-CASH-001", "TEST-PERSIST-JV-SALE-CREDIT-001", "TEST-PERSIST-JV-SALE-RETURN-001", "TEST-PERSIST-JV-PURCHASE-001", "TEST-PERSIST-JV-PURCHASE-RETURN-001"] });
  }
  if (url.pathname === "/api/cloud/health") {
    const result = await env.ONEX_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return cloudJson({ ok: true, service: "onex-d1-api", database: "onex-production", tables: result.results?.map((row) => row.name) ?? [] });
  }
  if (url.pathname === "/api/cloud/master-data") {
    const [companies, branches, warehouses, roles, periods, customers, suppliers, items, accounts] = await Promise.all([
      env.ONEX_DB.prepare("SELECT * FROM companies ORDER BY id").all(), env.ONEX_DB.prepare("SELECT * FROM branches WHERE active=1 ORDER BY code").all(), env.ONEX_DB.prepare("SELECT * FROM warehouses WHERE active=1 ORDER BY code").all(), env.ONEX_DB.prepare("SELECT * FROM roles WHERE active=1 ORDER BY code").all(), env.ONEX_DB.prepare("SELECT * FROM fiscal_periods ORDER BY startsOn DESC").all(),
      env.ONEX_DB.prepare("SELECT * FROM customers ORDER BY code").all(), env.ONEX_DB.prepare("SELECT * FROM suppliers ORDER BY code").all(), env.ONEX_DB.prepare("SELECT * FROM items ORDER BY code").all(), env.ONEX_DB.prepare("SELECT * FROM accounts ORDER BY code").all(),
    ]);
    return cloudJson({ companies: companies.results, branches: branches.results, warehouses: warehouses.results, roles: roles.results, fiscalPeriods: periods.results, customers: customers.results, suppliers: suppliers.results, items: items.results, accounts: accounts.results });
  }
  if (url.pathname === "/api/cloud/auth/me") return cloudJson({ id: 1, openId: "cloud-user", name: "مدير النظام", email: "admin@onex.local", role: "admin" });
  if (url.pathname === "/api/cloud/auth/logout") return cloudJson({ ok: true });
  if (url.pathname === "/api/cloud/dashboard") {
    const [invoices, journals, domains] = await Promise.all([
      env.ONEX_DB.prepare("SELECT COUNT(*) AS count FROM invoices WHERE status='POSTED'").first(),
      env.ONEX_DB.prepare("SELECT COUNT(*) AS count FROM journal_entries").first(),
      env.ONEX_DB.prepare("SELECT COUNT(DISTINCT domainCode) AS count FROM window_registry").first().catch(() => ({ count: 0 })),
    ]);
    return cloudJson({ windows: 1490, domains: Number(domains?.count || 0), invoices: Number(invoices?.count || 0), stockValue: "0.00", journals: Number(journals?.count || 0) });
  }
  if (url.pathname === "/api/cloud/system-settings" && request.method === "GET") {
    const row = await env.ONEX_DB.prepare("SELECT companyId,engine,host,port,databaseName,ssl,updatedBy,updatedAt FROM system_settings WHERE companyId=1 LIMIT 1").first();
    return cloudJson(row || { companyId: 1, engine: "mysql", host: "", port: 3306, databaseName: "", ssl: 1, updatedBy: "system" });
  }
  if (url.pathname === "/api/cloud/system-settings" && request.method === "POST") {
    const body = await request.json();
    await env.ONEX_DB.prepare("INSERT INTO system_settings(companyId,engine,host,port,databaseName,ssl,updatedBy,updatedAt) VALUES(1,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(companyId) DO UPDATE SET engine=excluded.engine,host=excluded.host,port=excluded.port,databaseName=excluded.databaseName,ssl=excluded.ssl,updatedBy=excluded.updatedBy,updatedAt=CURRENT_TIMESTAMP").bind(body.engine, body.host || null, Number(body.port || 3306), body.databaseName || null, Number(body.ssl ? 1 : 0), body.updatedBy || "cloud-user").run();
    return cloudJson({ ...(await env.ONEX_DB.prepare("SELECT companyId,engine,host,port,databaseName,ssl,updatedBy,updatedAt FROM system_settings WHERE companyId=1 LIMIT 1").first()), saved: true, secretPolicy: "DATABASE_URL remains a server secret" });
  }
  if (url.pathname === "/api/cloud/windows" && request.method === "GET") {
    const q = (url.searchParams.get("search") || "").trim(); const domain = (url.searchParams.get("domain") || "").trim(); const lim = limitOf(url); const like = `%${q}%`;
    const exists = await env.ONEX_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='window_registry' LIMIT 1").first();
    if (!exists) return cloudJson([]);
    const result = await env.ONEX_DB.prepare("SELECT * FROM window_registry WHERE (? = '' OR legacyForm LIKE ? OR screenName LIKE ? OR capability LIKE ?) AND (? = '' OR domainCode = ?) ORDER BY displayOrder, legacyForm LIMIT ?").bind(q, like, like, like, domain, domain, lim).all();
    return cloudJson(result.results ?? []);
  }
  if (url.pathname === "/api/cloud/windows/tree" && request.method === "GET") {
    const exists = await env.ONEX_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='window_registry' LIMIT 1").first();
    if (!exists) return cloudJson([]);
    const result = await env.ONEX_DB.prepare("SELECT id, screenNo, screenName, parentId, legacyForm, domainCode, capability, displayOrder, itemType, formName FROM window_registry ORDER BY domainCode, displayOrder, legacyForm LIMIT ?").bind(limitOf(url, 100)).all();
    return cloudJson(result.results ?? []);
  }
  if (url.pathname.startsWith("/api/cloud/windows/contract/")) {
    const legacyForm = decodeURIComponent(url.pathname.split("/").pop() || "").replace(/\.fmx$/i, "").toUpperCase();
    const liveCrud = { ARST003: "customers", APSI002: "suppliers", INVT003: "items", GLST001: "accounts" }[legacyForm];
    return cloudJson({ legacyForm: `${legacyForm}.fmx`, coreApi: liveCrud ? `ONEX_${liveCrud.toUpperCase()}_D1_API` : "ONEX_WINDOW_API", status: liveCrud ? "IMPLEMENTED_WITH_CLOUD_CORE" : "CLOUD_D1_RUNTIME", actions: liveCrud ? ["initialize", "query", "new", "validate", "save", "update", "delete", "refresh", "exit"] : ["initialize", "query", "refresh", "exit"], fields: [], triggers: [], procedures: [], notes: liveCrud ? `Live Cloudflare D1 CRUD for ${liveCrud}` : "Cloud D1 runtime contract" });
  }
  if (url.pathname === "/api/cloud/windows/records") {
    const form = (url.searchParams.get("legacyForm") || "").replace(/\.fmx$/i, "").toUpperCase();
    const search = (url.searchParams.get("search") || "").trim();
    const limit = limitOf(url);
    const like = `%${search}%`;
    let sql;
    let binds;
    if (form === "ERP_DBA" || form === "ADMT027") {
      sql = "SELECT id, openId, name, email, role, loginMethod, lastSignedIn FROM users WHERE (? = '' OR openId LIKE ? OR name LIKE ? OR email LIKE ?) ORDER BY id LIMIT ?";
      binds = [search, like, like, like, limit];
    } else if (form === "ERP_DBA_DFLT_DATA") {
      sql = "SELECT id, companyId, code, name, active FROM branches WHERE (? = '' OR code LIKE ? OR name LIKE ?) ORDER BY code LIMIT ?";
      binds = [search, like, like, limit];
    } else if (form === "MRPACS004") {
      sql = "SELECT id, companyId, code, name, active FROM warehouses WHERE (? = '' OR code LIKE ? OR name LIKE ?) ORDER BY code LIMIT ?";
      binds = [search, like, like, limit];
    } else if (form === "ERP_JOURNAL") {
      sql = "SELECT id, actor, actionCode, entityType, entityId, requestId, createdAt FROM audit_events WHERE (? = '' OR actionCode LIKE ? OR entityType LIKE ?) ORDER BY createdAt DESC, id DESC LIMIT ?";
      binds = [search, like, like, limit];
    } else if (form === "ARST004" || form.startsWith("POST")) {
      sql = "SELECT id, docNo, customerId, warehouseId, subtotal, taxTotal, grandTotal, status, sourceForm, createdAt FROM invoices WHERE (? = '' OR docNo LIKE ? OR sourceForm LIKE ?) ORDER BY createdAt DESC, id DESC LIMIT ?";
      binds = [search, like, like, limit];
    } else if (form.startsWith("ARST") || form.startsWith("ARSR")) {
      sql = "SELECT id, companyId, code, legalName, currencyCode, status FROM customers WHERE (? = '' OR code LIKE ? OR legalName LIKE ?) ORDER BY code LIMIT ?";
      binds = [search, like, like, limit];
    } else if (form === "APSI002") {
      sql = "SELECT id, companyId, code, legalName, currencyCode, status FROM suppliers WHERE (? = '' OR code LIKE ? OR legalName LIKE ?) ORDER BY code LIMIT ?";
      binds = [search, like, like, limit];
    } else if (form === "APST003") {
      sql = "SELECT id, docNo, supplierId, warehouseId, subtotal, taxTotal, grandTotal, status, createdAt FROM purchase_invoices WHERE (? = '' OR docNo LIKE ?) ORDER BY createdAt DESC, id DESC LIMIT ?";
      binds = [search, like, limit];
    } else if (form.startsWith("APST") || form.startsWith("APSR")) {
      sql = "SELECT id, companyId, code, legalName, currencyCode, status FROM suppliers WHERE (? = '' OR code LIKE ? OR legalName LIKE ?) ORDER BY code LIMIT ?";
      binds = [search, like, like, limit];
    } else if (form.startsWith("INVT") || form.startsWith("INVI")) {
      sql = "SELECT id, companyId, code, name, description, itemType, unitCode, stockFlag, unitCost, revenueAccount, inventoryAccount, cogsAccount, active FROM items WHERE (? = '' OR code LIKE ? OR name LIKE ? OR description LIKE ?) ORDER BY code LIMIT ?";
      binds = [search, like, like, like, limit];
    } else if (form === "GLST001") {
      sql = "SELECT id, companyId, code, name, accountType, parentCode, currencyCode, active FROM accounts WHERE (? = '' OR code LIKE ? OR name LIKE ?) ORDER BY code LIMIT ?";
      binds = [search, like, like, limit];
    } else if (form.startsWith("GLST") || form.startsWith("GLSI") || form.startsWith("GLSR")) {
      sql = "SELECT id, journalNo, entryType, totalDebit, totalCredit, status, createdAt, createdBy FROM journal_entries WHERE (? = '' OR journalNo LIKE ? OR entryType LIKE ?) ORDER BY createdAt DESC, id DESC LIMIT ?";
      binds = [search, like, like, limit];
    } else {
      const executionTable = await env.ONEX_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='window_executions' LIMIT 1").first();
      if (executionTable) {
        const result = await env.ONEX_DB.prepare("SELECT id, legacyForm, actionCode, requestId, actor, status, responseJson, createdAt FROM window_executions WHERE legacyForm=? AND (? = '' OR actionCode LIKE ? OR requestId LIKE ? OR status LIKE ?) ORDER BY createdAt DESC, id DESC LIMIT ?").bind(`${form}.fmx`, search, like, like, like, limit).all();
        return cloudJson(result.results ?? []);
      }
      const result = await env.ONEX_DB.prepare("SELECT id, actor, actionCode, entityType, entityId, requestId, createdAt FROM audit_events WHERE (? = '' OR actionCode LIKE ? OR entityType LIKE ? OR entityId LIKE ? OR requestId LIKE ?) ORDER BY createdAt DESC, id DESC LIMIT ?").bind(search, like, like, like, like, limit).all();
      return cloudJson(result.results ?? []);
    }
    const rows = await env.ONEX_DB.prepare(sql).bind(...binds).all();
    return cloudJson(rows.results ?? []);
  }
  if (url.pathname === "/api/cloud/windows/records/update" && request.method === "POST") {
    const x = await readBody(request);
    const form = String(x.legacyForm || "").replace(/\.fmx$/i, "").toUpperCase();
    const id = Number(x.id);
    const requested = x.fields && typeof x.fields === "object" ? x.fields : {};
    if (!form || !Number.isInteger(id) || id < 1) return cloudJson({ error: "legacyForm and id are required" }, 400);
    const configs = form === "ARST004" || form.startsWith("POST")
      ? { table: "invoices", fields: ["status"] }
      : form.startsWith("ARST") || form.startsWith("ARSR")
        ? { table: "customers", fields: ["legalName", "currencyCode", "status"] }
        : form.startsWith("APST") || form.startsWith("APSR")
          ? { table: "suppliers", fields: ["legalName", "currencyCode", "status"] }
          : form.startsWith("INVT") || form.startsWith("INVI")
            ? { table: "items", fields: ["name", "itemType", "unitCode", "active"] }
            : form.startsWith("GLST") || form.startsWith("GLSI") || form.startsWith("GLSR")
              ? { table: "journal_entries", fields: ["entryType", "status"] }
              : null;
    if (!configs) return cloudJson({ error: "WINDOW_RECORD_NOT_EDITABLE" }, 400);
    const updates = configs.fields.filter((field) => Object.prototype.hasOwnProperty.call(requested, field) && requested[field] !== null && requested[field] !== undefined).map((field) => `${field} = ?`);
    const values = configs.fields.filter((field) => Object.prototype.hasOwnProperty.call(requested, field) && requested[field] !== null && requested[field] !== undefined).map((field) => requested[field]);
    if (!updates.length) return cloudJson({ error: "NO_EDITABLE_FIELDS" }, 400);
    values.push(id);
    const result = await env.ONEX_DB.prepare(`UPDATE ${configs.table} SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    return cloudJson({ ok: true, table: configs.table, id, result });
  }
  if (url.pathname === "/api/cloud/windows/records/delete" && request.method === "POST") {
    const x = await readBody(request); const form = String(x.legacyForm || "").replace(/\.fmx$/i, "").toUpperCase(); const id = Number(x.id);
    if (!form || !positiveInteger(id)) return cloudJson({ error: "legacyForm and id are required" }, 400);
    const directTable = { ARST003: "customers", APSI002: "suppliers", INVT003: "items", GLST001: "accounts" }[form];
    if (directTable) {
      const target = new URL(`/api/cloud/${directTable}/${id}`, request.url);
      const forwarded = new Request(target, { method: "DELETE", headers: request.headers });
      return api(forwarded, env, target);
    }
    if (form === "ERP_DBA" || form === "ADMT027") {
      const current = await env.ONEX_DB.prepare("SELECT id FROM users WHERE id=? LIMIT 1").bind(id).first();
      if (!current) return cloudJson({ error: "USER_NOT_FOUND" }, 404);
      const result = await env.ONEX_DB.batch([env.ONEX_DB.prepare("DELETE FROM users WHERE id=?").bind(id), env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind("cloud-user", "DELETE", "USER", String(id), `USER:DELETE:${id}`)]);
      return cloudJson({ ok: true, id, deleted: true, result });
    }
    if (form === "ERP_DBA_DFLT_DATA") {
      const current = await env.ONEX_DB.prepare("SELECT id FROM branches WHERE id=? LIMIT 1").bind(id).first();
      if (!current) return cloudJson({ error: "BRANCH_NOT_FOUND" }, 404);
      const result = await env.ONEX_DB.batch([env.ONEX_DB.prepare("DELETE FROM branches WHERE id=?").bind(id), env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind("cloud-user", "DELETE", "BRANCH", String(id), `BRANCH:DELETE:${id}`)]);
      return cloudJson({ ok: true, id, deleted: true, result });
    }
    if (form === "MRPACS004") {
      const current = await env.ONEX_DB.prepare("SELECT id FROM warehouses WHERE id=? LIMIT 1").bind(id).first();
      if (!current) return cloudJson({ error: "WAREHOUSE_NOT_FOUND" }, 404);
      const invoice = await env.ONEX_DB.prepare("SELECT id FROM invoices WHERE warehouseId=? LIMIT 1").bind(id).first();
      const balance = await env.ONEX_DB.prepare("SELECT id FROM stock_balances WHERE warehouseId=? LIMIT 1").bind(id).first();
      if (invoice || balance) return cloudJson({ error: "WAREHOUSE_HAS_TRANSACTIONS" }, 409);
      const result = await env.ONEX_DB.batch([env.ONEX_DB.prepare("DELETE FROM warehouses WHERE id=?").bind(id), env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind("cloud-user", "DELETE", "WAREHOUSE", String(id), `WAREHOUSE:DELETE:${id}`)]);
      return cloudJson({ ok: true, id, deleted: true, result });
    }
    if (form === "ARST004" || form.startsWith("POST")) {
      const current = await env.ONEX_DB.prepare("SELECT id, status FROM invoices WHERE id=? LIMIT 1").bind(id).first();
      if (!current) return cloudJson({ error: "DOCUMENT_NOT_FOUND" }, 404);
      if (current.status !== "DRAFT") return cloudJson({ error: "POSTED_DOCUMENT_CANNOT_BE_DELETED" }, 409);
      const result = await env.ONEX_DB.batch([env.ONEX_DB.prepare("DELETE FROM invoice_lines WHERE invoiceId=?").bind(id), env.ONEX_DB.prepare("DELETE FROM invoices WHERE id=?").bind(id), env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind("cloud-user", "DELETE", "AR_DOCUMENT", String(id), `DOCUMENT:DELETE:${id}`)]);
      return cloudJson({ ok: true, id, deleted: true, result });
    }
    if (form === "APST003") {
      const exists = await env.ONEX_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='purchase_invoices' LIMIT 1").first();
      if (!exists) return cloudJson({ error: "PURCHASE_DOCUMENT_TABLE_NOT_FOUND" }, 404);
      const current = await env.ONEX_DB.prepare("SELECT id, status FROM purchase_invoices WHERE id=? LIMIT 1").bind(id).first();
      if (!current) return cloudJson({ error: "DOCUMENT_NOT_FOUND" }, 404);
      if (current.status !== "DRAFT") return cloudJson({ error: "POSTED_DOCUMENT_CANNOT_BE_DELETED" }, 409);
      const result = await env.ONEX_DB.batch([env.ONEX_DB.prepare("DELETE FROM purchase_lines WHERE purchaseInvoiceId=?").bind(id), env.ONEX_DB.prepare("DELETE FROM purchase_invoices WHERE id=?").bind(id), env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind("cloud-user", "DELETE", "AP_DOCUMENT", String(id), `DOCUMENT:DELETE:${id}`)]);
      return cloudJson({ ok: true, id, deleted: true, result });
    }
    return cloudJson({ error: "WINDOW_DELETE_NOT_SUPPORTED" }, 400);
  }
  if (url.pathname === "/api/cloud/windows/action" && request.method === "POST") {
    const x = await readBody(request);
    const form = String(x.legacyForm || "").replace(/\.fmx$/i, "").toUpperCase();
    const action = String(x.action || "").toLowerCase();
    const actor = String(x.actor || request.headers.get("x-onex-actor") || "").trim();
    const requestId = String(x.requestId || `${form}:${action}:${Date.now()}`).trim();
    const allowed = new Set(["initialize", "query", "new", "validate", "save", "update", "delete", "post", "reverse", "refresh", "print", "exit"]);
    if (!form || !actor || !allowed.has(action)) return cloudJson({ error: "WINDOW_ACTION_NOT_AUTHORIZED" }, 403);
    const table = await env.ONEX_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='window_executions' LIMIT 1").first();
    if (!table) return cloudJson({ error: "WINDOW_EXECUTIONS_TABLE_NOT_FOUND" }, 503);
    const existing = await env.ONEX_DB.prepare("SELECT id, status, responseJson FROM window_executions WHERE requestId=? LIMIT 1").bind(requestId).first();
    if (existing) return cloudJson({ ok: true, status: existing.status, idempotent: true, executionId: existing.id, response: existing.responseJson ? JSON.parse(existing.responseJson) : null });
    const response = { form: `${form}.fmx`, action, source: "cloud-d1", live: true };
    const result = await env.ONEX_DB.prepare("INSERT INTO window_executions(legacyForm,actionCode,requestId,actor,mode,status,responseJson) VALUES(?,?,?,?,?,?,?) RETURNING id,legacyForm,actionCode,requestId,actor,status,createdAt").bind(`${form}.fmx`, action.toUpperCase(), requestId, actor, "CLOUD_D1", "COMMITTED", JSON.stringify(response)).first();
    return cloudJson({ ok: true, status: "COMMITTED", live: true, execution: result, response });
  }
  if (url.pathname === "/api/cloud/ai/assist" && request.method === "POST") return cloudJson({ answer: "تم تحويل الطلب إلى طبقة Cloudflare D1. هذه إجابة تشغيلية أولية من Worker، ويمكن ربط نموذج الذكاء الاصطناعي لاحقًا." });
  if (url.pathname === "/api/cloud/users" && request.method === "GET") {
    const q = (url.searchParams.get("search") || "").trim(); const lim = limitOf(url); const like = `%${q}%`;
    const r = await env.ONEX_DB.prepare("SELECT id, openId, name, email, role, loginMethod, lastSignedIn FROM users WHERE (? = '' OR openId LIKE ? OR name LIKE ? OR email LIKE ?) ORDER BY id LIMIT ?").bind(q, like, like, like, lim).all();
    return cloudJson(r.results);
  }
  if (url.pathname === "/api/cloud/users" && request.method === "POST") {
    const x = await readBody(request); if (!x.openId) return cloudJson({ error: "openId is required" }, 400);
    const r = await env.ONEX_DB.prepare("INSERT INTO users(openId,name,email,loginMethod,role) VALUES(?,?,?,?,?) ON CONFLICT(openId) DO UPDATE SET name=excluded.name,email=excluded.email,loginMethod=excluded.loginMethod,role=excluded.role").bind(x.openId, x.name || null, x.email || null, x.loginMethod || "workbench", x.role || "user").run();
    return cloudJson({ ok: true, result: r });
  }
  if (url.pathname === "/api/cloud/branches" && request.method === "GET") {
    const q = (url.searchParams.get("search") || "").trim(); const lim = limitOf(url); const like = `%${q}%`;
    const r = await env.ONEX_DB.prepare("SELECT id, companyId, code, name, active FROM branches WHERE (? = '' OR code LIKE ? OR name LIKE ?) ORDER BY code LIMIT ?").bind(q, like, like, lim).all();
    return cloudJson(r.results);
  }
  if (url.pathname === "/api/cloud/branches" && request.method === "POST") {
    const x = await readBody(request); if (!x.code || !x.name) return cloudJson({ error: "code and name are required" }, 400);
    const r = await env.ONEX_DB.prepare("INSERT INTO branches(companyId,code,name,active) VALUES(?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET name=excluded.name,active=excluded.active").bind(x.companyId || 1, x.code, x.name, x.active ?? 1).run();
    return cloudJson({ ok: true, result: r });
  }
  if (url.pathname === "/api/cloud/warehouses" && request.method === "GET") {
    const q = (url.searchParams.get("search") || "").trim(); const lim = limitOf(url); const like = `%${q}%`;
    const r = await env.ONEX_DB.prepare("SELECT id, companyId, code, name, active FROM warehouses WHERE (? = '' OR code LIKE ? OR name LIKE ?) ORDER BY code LIMIT ?").bind(q, like, like, lim).all();
    return cloudJson(r.results);
  }
  if (url.pathname === "/api/cloud/warehouses" && request.method === "POST") {
    const x = await readBody(request); if (!x.code || !x.name) return cloudJson({ error: "code and name are required" }, 400);
    const r = await env.ONEX_DB.prepare("INSERT INTO warehouses(companyId,code,name,active) VALUES(?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET name=excluded.name,active=excluded.active").bind(x.companyId || 1, x.code, x.name, x.active ?? 1).run();
    return cloudJson({ ok: true, result: r });
  }
  if (url.pathname === "/api/cloud/item-trace" && request.method === "GET") {
    const itemId = Number(url.searchParams.get("itemId")); const warehouseId = url.searchParams.get("warehouseId");
    if (!positiveInteger(itemId)) return cloudJson({ error: "ITEM_ID_REQUIRED" }, 400);
    const item = await env.ONEX_DB.prepare("SELECT id,companyId,code,name,description,unitCode,currencyCode,stockFlag,unitCost,salePrice,revenueAccount,inventoryAccount,cogsAccount,active FROM items WHERE id=? LIMIT 1").bind(itemId).first();
    if (!item) return cloudJson({ error: "ITEM_NOT_FOUND" }, 404);
    const balances = await env.ONEX_DB.prepare("SELECT sb.warehouseId,w.code AS warehouseCode,w.name AS warehouseName,sb.quantity,sb.reservedQuantity,sb.unitCost,sb.totalCost,sb.versionNo FROM stock_balances sb JOIN warehouses w ON w.id=sb.warehouseId WHERE sb.itemId=? AND (? IS NULL OR sb.warehouseId=?) ORDER BY w.code").bind(itemId, warehouseId ? Number(warehouseId) : null, warehouseId ? Number(warehouseId) : null).all();
    const movements = await env.ONEX_DB.prepare("SELECT sm.id,sm.itemId,sm.warehouseId,sm.sourceInvoiceId,sm.inventoryDocumentId,sm.movementType,sm.quantityIn,sm.quantityOut,sm.unitCost,sm.totalCost,sm.balanceAfter,sm.createdBy,sm.createdAt,COALESCE(d.docNo,si.docNo,pi.docNo,sm.reference) AS docNo FROM stock_movements sm LEFT JOIN inventory_documents d ON d.id=sm.inventoryDocumentId LEFT JOIN invoices si ON si.id=sm.sourceInvoiceId LEFT JOIN purchase_invoices pi ON pi.docNo=sm.reference WHERE sm.itemId=? AND (? IS NULL OR sm.warehouseId=?) ORDER BY sm.createdAt DESC,sm.id DESC LIMIT 100").bind(itemId, warehouseId ? Number(warehouseId) : null, warehouseId ? Number(warehouseId) : null).all();
    return cloudJson({ item: { ...item, balances: balances.results ?? [] }, movements: movements.results ?? [] });
  }
  if (url.pathname === "/api/cloud/accounts" && request.method === "GET") {
    const q = (url.searchParams.get("search") || "").trim(); const lim = limitOf(url);
    const r = q ? await env.ONEX_DB.prepare("SELECT * FROM accounts WHERE code LIKE ? OR name LIKE ? ORDER BY code LIMIT ?").bind(`%${q}%`, `%${q}%`, lim).all() : await env.ONEX_DB.prepare("SELECT * FROM accounts ORDER BY code LIMIT ?").bind(lim).all();
    return cloudJson(r.results);
  }
  if (url.pathname === "/api/cloud/accounts" && request.method === "POST") {
    const x = await readBody(request); if (!x.code || !x.name || !x.accountType) return cloudJson({ error: "code, name, and accountType are required" }, 400);
    if (positiveInteger(Number(x.id))) {
      const result = await env.ONEX_DB.prepare("UPDATE accounts SET companyId=?,code=?,name=?,accountType=?,parentCode=?,currencyCode=?,active=? WHERE id=?").bind(x.companyId || 1, x.code, x.name, x.accountType, x.parentCode || null, x.currencyCode || "SAR", x.active ?? 1, Number(x.id)).run();
      return cloudJson({ ok: true, result, updated: true });
    }
    const r = await env.ONEX_DB.prepare("INSERT INTO accounts(companyId,code,name,accountType,parentCode,currencyCode,active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET name=excluded.name,accountType=excluded.accountType,parentCode=excluded.parentCode,currencyCode=excluded.currencyCode,active=excluded.active").bind(x.companyId || 1, x.code, x.name, x.accountType, x.parentCode || null, x.currencyCode || "SAR", x.active ?? 1).run(); return cloudJson({ ok: true, result: r });
  }
  if (url.pathname === "/api/cloud/accounts/import" && request.method === "POST") {
    const x = await readBody(request); const rows = Array.isArray(x.rows) ? x.rows.slice(0, 1000) : [];
    if (!rows.length) return cloudJson({ error: "ACCOUNT_IMPORT_ROWS_REQUIRED" }, 400);
    const statements = [];
    for (const row of rows) {
      if (!row?.code || !row?.name || !row?.accountType) return cloudJson({ error: "ACCOUNT_IMPORT_ROW_INVALID" }, 400);
      statements.push(env.ONEX_DB.prepare("INSERT INTO accounts(companyId,code,name,accountType,parentCode,currencyCode,active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET name=excluded.name,accountType=excluded.accountType,parentCode=excluded.parentCode,currencyCode=excluded.currencyCode,active=excluded.active").bind(x.companyId || 1, String(row.code), String(row.name), String(row.accountType), row.parentCode || null, row.currencyCode || "SAR", row.active ?? 1));
    }
    statements.push(env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind(x.actor || "cloud-user", "IMPORT", "ACCOUNT_CATALOG", "BATCH", `ACCOUNT:IMPORT:${Date.now()}`));
    const result = await env.ONEX_DB.batch(statements); return cloudJson({ ok: true, imported: rows.length, result });
  }
  if (url.pathname.startsWith("/api/cloud/accounts/") && request.method === "DELETE") {
    const id = Number(url.pathname.split("/").pop());
    if (!positiveInteger(id)) return cloudJson({ error: "ACCOUNT_ID_REQUIRED" }, 400);
    const current = await env.ONEX_DB.prepare("SELECT id, code FROM accounts WHERE id=? LIMIT 1").bind(id).first();
    if (!current) return cloudJson({ error: "ACCOUNT_NOT_FOUND" }, 404);
    const journalLine = await env.ONEX_DB.prepare("SELECT id FROM journal_entry_lines WHERE accountCode=? LIMIT 1").bind(current.code).first();
    const itemReference = await env.ONEX_DB.prepare("SELECT id FROM items WHERE revenueAccount=? OR inventoryAccount=? OR cogsAccount=? LIMIT 1").bind(current.code, current.code, current.code).first();
    if (journalLine || itemReference) return cloudJson({ error: "ACCOUNT_HAS_REFERENCES" }, 409);
    const result = await env.ONEX_DB.batch([
      env.ONEX_DB.prepare("DELETE FROM accounts WHERE id=?").bind(id),
      env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind("cloud-user", "DELETE", "ACCOUNT", String(id), `ACCOUNT:DELETE:${id}`),
    ]);
    return cloudJson({ ok: true, id, deleted: true, result });
  }
  if (url.pathname === "/api/cloud/accounting/defaults" && request.method === "GET") {
    const result = await env.ONEX_DB.prepare("SELECT * FROM accounting_defaults WHERE companyId=1 LIMIT 1").first();
    const tree = await env.ONEX_DB.prepare("SELECT id,code,name,accountType,parentCode,currencyCode,active FROM accounts WHERE companyId=1 ORDER BY code").all();
    return cloudJson({ defaults: result, accounts: tree.results ?? [] });
  }
  if (url.pathname === "/api/cloud/cash-boxes" && request.method === "GET") {
    const result = await env.ONEX_DB.prepare("SELECT c.*, a.code AS accountCode, a.name AS accountName FROM cash_boxes c LEFT JOIN accounts a ON a.id=c.accountId WHERE c.companyId=1 ORDER BY c.code").all();
    return cloudJson(result.results ?? []);
  }
  if (url.pathname === "/api/cloud/cash-boxes" && request.method === "POST") {
    const x = await readBody(request); if (!x.code || !x.name) return cloudJson({ error: "CASH_BOX_CODE_AND_NAME_REQUIRED" }, 400);
    await env.ONEX_DB.prepare("INSERT INTO cash_boxes(companyId,code,name,currencyCode,status) VALUES(?,?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET name=excluded.name,currencyCode=excluded.currencyCode,status=excluded.status").bind(x.companyId || 1, x.code, x.name, x.currencyCode || "SAR", x.status || "ACTIVE").run();
    const row = await env.ONEX_DB.prepare("SELECT id,companyId,code,name,currencyCode,status,accountId FROM cash_boxes WHERE companyId=? AND code=? LIMIT 1").bind(x.companyId || 1, x.code).first();
    return cloudJson(row);
  }
  if (url.pathname === "/api/cloud/banks" && request.method === "GET") {
    const result = await env.ONEX_DB.prepare("SELECT b.*, a.code AS accountCode, a.name AS accountName FROM banks b LEFT JOIN accounts a ON a.id=b.accountId WHERE b.companyId=1 ORDER BY b.code").all();
    return cloudJson(result.results ?? []);
  }
  if (url.pathname === "/api/cloud/banks" && request.method === "POST") {
    const x = await readBody(request); if (!x.code || !x.name) return cloudJson({ error: "BANK_CODE_AND_NAME_REQUIRED" }, 400);
    await env.ONEX_DB.prepare("INSERT INTO banks(companyId,code,name,accountNumber,currencyCode,status) VALUES(?,?,?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET name=excluded.name,accountNumber=excluded.accountNumber,currencyCode=excluded.currencyCode,status=excluded.status").bind(x.companyId || 1, x.code, x.name, x.accountNumber || null, x.currencyCode || "SAR", x.status || "ACTIVE").run();
    const row = await env.ONEX_DB.prepare("SELECT id,companyId,code,name,accountNumber,currencyCode,status,accountId FROM banks WHERE companyId=? AND code=? LIMIT 1").bind(x.companyId || 1, x.code).first();
    return cloudJson(row);
  }
  if (url.pathname === "/api/cloud/currencies" && request.method === "GET") {
    const rows = await env.ONEX_DB.prepare("SELECT code,name,decimalScale,active FROM currencies ORDER BY code").all(); return cloudJson(rows.results ?? []);
  }
  if (url.pathname === "/api/cloud/currencies" && request.method === "POST") {
    const x = await readBody(request); const code = String(x.code || "").trim().toUpperCase(); const name = String(x.name || "").trim();
    if (!/^[A-Z]{3}$/.test(code) || !name) return cloudJson({ error: "CURRENCY_CODE_AND_NAME_REQUIRED" }, 400);
    const result = await env.ONEX_DB.prepare("INSERT INTO currencies(code,name,decimalScale,active) VALUES(?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,decimalScale=excluded.decimalScale,active=excluded.active").bind(code, name, Number(x.decimalScale ?? 2), x.active ?? 1).run();
    return cloudJson({ ok: true, code, name, decimalScale: Number(x.decimalScale ?? 2), active: x.active ?? 1, result });
  }
  const collection = { items: ["items", "code", "name"], customers: ["customers", "code", "legalName"], suppliers: ["suppliers", "code", "legalName"] };
  for (const [route, [table, codeField, nameField]] of Object.entries(collection)) {
    if (url.pathname.startsWith(`/api/cloud/${route}/`) && request.method === "DELETE") {
      const id = Number(url.pathname.split("/").pop());
      if (!positiveInteger(id)) return cloudJson({ error: `${route.toUpperCase()}_ID_REQUIRED` }, 400);
      const current = await env.ONEX_DB.prepare(`SELECT id, code FROM ${table} WHERE id=? LIMIT 1`).bind(id).first();
      if (!current) return cloudJson({ error: `${route.toUpperCase().slice(0, -1)}_NOT_FOUND` }, 404);
      const referenceTables = table === "customers"
        ? [["invoices", "customerId"]]
        : table === "suppliers"
          ? [["purchase_invoices", "supplierId"]]
          : [["invoice_lines", "itemId"], ["purchase_lines", "itemId"], ["stock_balances", "itemId"], ["stock_movements", "itemId"], ["inventory_count_lines", "itemId"], ["inventory_document_lines", "itemId"]];
      for (const [referenceTable, referenceColumn] of referenceTables) {
        const tableExists = await env.ONEX_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(referenceTable).first();
        if (!tableExists) continue;
        const reference = await env.ONEX_DB.prepare(`SELECT id FROM ${referenceTable} WHERE ${referenceColumn}=? LIMIT 1`).bind(id).first();
        if (reference) return cloudJson({ error: `${route.toUpperCase().slice(0, -1)}_HAS_TRANSACTIONS` }, 409);
      }
      const result = await env.ONEX_DB.batch([
        env.ONEX_DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id),
        env.ONEX_DB.prepare("INSERT INTO audit_events(actor,actionCode,entityType,entityId,requestId) VALUES(?,?,?,?,?)").bind("cloud-user", "DELETE", route.slice(0, -1).toUpperCase(), String(id), `${route.toUpperCase()}:DELETE:${id}`),
      ]);
      return cloudJson({ ok: true, id, deleted: true, result });
    }
    if (url.pathname === `/api/cloud/${route}` && request.method === "GET") {
      const q = (url.searchParams.get("search") || "").trim(); const lim = limitOf(url); const sql = q ? `SELECT * FROM ${table} WHERE code LIKE ? OR ${nameField} LIKE ? ORDER BY code LIMIT ?` : `SELECT * FROM ${table} ORDER BY code LIMIT ?`;
      const r = q ? await env.ONEX_DB.prepare(sql).bind(`%${q}%`, `%${q}%`, lim).all() : await env.ONEX_DB.prepare(sql).bind(lim).all(); return cloudJson(r.results);
    }
    if (url.pathname === `/api/cloud/${route}` && request.method === "POST") {
      const x = await readBody(request); if (!x.code || !x[nameField]) return cloudJson({ error: `code and ${nameField} are required` }, 400);
      if (positiveInteger(Number(x.id))) {
        const sql = table === "items" ? "UPDATE items SET companyId=?,code=?,name=?,description=?,itemType=?,unitCode=?,stockFlag=?,unitCost=?,revenueAccount=?,inventoryAccount=?,cogsAccount=?,currencyCode=?,active=? WHERE id=?" : `UPDATE ${table} SET companyId=?,code=?,legalName=?,currencyCode=?,status=? WHERE id=?`;
        const values = table === "items" ? [x.companyId || 1, x.code, x.name || x.description, x.description || x.name, x.itemType || "STOCK", x.unitCode || "EA", x.stockFlag ?? 1, x.unitCost || "0", x.revenueAccount || "4100", x.inventoryAccount || "1300", x.cogsAccount || "5100", x.currencyCode || "SAR", x.active ?? 1, Number(x.id)] : [x.companyId || 1, x.code, x[nameField], x.currencyCode || "SAR", x.status || "ACTIVE", Number(x.id)];
        const updateResult = await env.ONEX_DB.prepare(sql).bind(...values).run(); if (table !== "items") await ensurePartyAccount(env, table, Number(x.id)); return cloudJson({ ok: true, result: updateResult, updated: true });
      }
      const sql = table === "items" ? "INSERT INTO items(companyId,code,name,description,itemType,unitCode,stockFlag,unitCost,revenueAccount,inventoryAccount,cogsAccount,currencyCode,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET name=excluded.name,description=excluded.description,itemType=excluded.itemType,unitCode=excluded.unitCode,stockFlag=excluded.stockFlag,unitCost=excluded.unitCost,revenueAccount=excluded.revenueAccount,inventoryAccount=excluded.inventoryAccount,cogsAccount=excluded.cogsAccount,currencyCode=excluded.currencyCode,active=excluded.active" : `INSERT INTO ${table}(companyId,code,legalName,currencyCode,status) VALUES(?,?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET legalName=excluded.legalName,currencyCode=excluded.currencyCode,status=excluded.status`;
      const values = table === "items" ? [x.companyId || 1, x.code, x.name || x.description, x.description || x.name, x.itemType || "STOCK", x.unitCode || "EA", x.stockFlag ?? 1, x.unitCost || "0", x.revenueAccount || "4100", x.inventoryAccount || "1300", x.cogsAccount || "5100", x.currencyCode || "SAR", x.active ?? 1] : [x.companyId || 1, x.code, x[nameField], x.currencyCode || "SAR", x.status || "ACTIVE"];
      const insertResult = await env.ONEX_DB.prepare(sql).bind(...values).run(); if (table !== "items") { const created = await env.ONEX_DB.prepare(`SELECT id FROM ${table} WHERE companyId=? AND code=? LIMIT 1`).bind(x.companyId || 1, x.code).first(); if (created?.id) await ensurePartyAccount(env, table, Number(created.id)); } return cloudJson({ ok: true, result: insertResult });
    }
  }
  if (url.pathname === "/api/cloud/journals" && request.method === "GET") { const r = await env.ONEX_DB.prepare("SELECT * FROM journal_entries ORDER BY createdAt DESC LIMIT ?").bind(limitOf(url)).all(); return cloudJson(r.results); }
  if (url.pathname === "/api/cloud/journals" && request.method === "POST") {
    const x = await readBody(request); if (!x.journalNo || !Array.isArray(x.lines) || !x.lines.length) return cloudJson({ error: "journalNo and lines are required" }, 400);
    const debit = x.lines.reduce((n, l) => n + Number(l.debit || 0), 0).toFixed(6); const credit = x.lines.reduce((n, l) => n + Number(l.credit || 0), 0).toFixed(6); if (debit !== credit) return cloudJson({ error: "journal is not balanced", debit, credit }, 400);
    const entry = await env.ONEX_DB.prepare("INSERT INTO journal_entries(journalNo,entryType,totalDebit,totalCredit,status) VALUES(?,?,?,?,?) RETURNING id,journalNo").bind(x.journalNo, x.entryType || "MANUAL", debit, credit, "POSTED").first();
    const schema = await env.ONEX_DB.prepare("PRAGMA table_info(journal_entry_lines)").all();
    const columns = new Set((schema.results || []).map((column) => column.name));
    const statements = x.lines.map((l) => columns.has("journalNo")
      ? env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalNo,accountCode,description,debit,credit) VALUES(?,?,?,?,?)").bind(x.journalNo, l.accountCode, l.description || null, l.debit || "0", l.credit || "0")
      : env.ONEX_DB.prepare("INSERT INTO journal_entry_lines(journalEntryId,accountCode,accountName,description,debit,credit) VALUES(?,?,?,?,?,?)").bind(entry.id, l.accountCode, l.accountName || null, l.description || null, l.debit || "0", l.credit || "0"));
    const result = await env.ONEX_DB.batch(statements);
    return cloudJson({ ok: true, journalNo: entry.journalNo, totalDebit: debit, totalCredit: credit, status: "POSTED", result });
  }
  if (url.pathname === "/api/cloud/stock/receive" && request.method === "POST") return receiveStock(env, request);
  if (url.pathname === "/api/cloud/invoices" && request.method === "GET") { const r = await env.ONEX_DB.prepare("SELECT * FROM invoices ORDER BY createdAt DESC LIMIT ?").bind(limitOf(url)).all(); return cloudJson(r.results); }
  if (url.pathname === "/api/cloud/invoices" && request.method === "POST") return createInvoice(env, request);
  if (url.pathname.startsWith("/api/cloud/invoices/") && request.method === "POST") {
    const id = Number(url.pathname.split("/").pop());
    const action = url.searchParams.get("action");
    if (!positiveInteger(id) || !["post", "reverse"].includes(action)) return cloudJson({ error: "use ?action=post or ?action=reverse" }, 400);
    return updateInvoiceStatus(env, request, id, action === "post" ? "POSTED" : "REVERSED");
  }
  if (url.pathname === "/api/cloud/reports/inventory") { const r = await env.ONEX_DB.prepare("SELECT itemId,warehouseId,quantity,unitCost,totalCost FROM stock_balances ORDER BY itemId LIMIT ?").bind(limitOf(url)).all(); return cloudJson({ reportCode: "MRPREP001", title: "Inventory valuation", rows: r.results }); }
  if (url.pathname === "/api/cloud/reports/accounts") { const r = await env.ONEX_DB.prepare("SELECT code,name,accountType,currencyCode,active FROM accounts ORDER BY code LIMIT ?").bind(limitOf(url)).all(); return cloudJson({ reportCode: "GLST001", title: "Chart of accounts", rows: r.results }); }
  if (url.pathname === "/api/cloud/reports/invoices") { const r = await env.ONEX_DB.prepare("SELECT docNo,customerId,grandTotal,status,createdAt FROM invoices ORDER BY createdAt DESC LIMIT ?").bind(limitOf(url)).all(); return cloudJson({ reportCode: "ARSR041", title: "Sales invoices", rows: r.results }); }
  return cloudJson({ error: "Cloud D1 route not found" }, 404);
}

export default {
  async fetch(request, env) {
    const headers = responseHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/cloud/")) return api(request, env, url);
      if (url.pathname === "/__health" && request.method === "GET") return health(env, request);
      if (url.pathname.startsWith("/api/inventory/")) {
        const auth = inventoryAuthorize(request, env, `${request.method} ${url.pathname}`);
        if (auth.error) return inventoryErrorResponse(auth.error, request, env, auth.status);
        const result = await inventoryDispatch(request, env, url.pathname, auth);
        if (result) return result;
        return inventoryErrorResponse("NOT_FOUND", request, env, 404);
      }
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
      const purchasePostMatch = url.pathname.match(/^\/api\/erp\/purchases\/(\d+)\/post$/);
      if (purchasePostMatch && request.method === "POST") return postPurchaseInvoice(env, request, Number(purchasePostMatch[1]));
      if (url.pathname === "/api/erp/vouchers" && request.method === "POST") return createVoucher(env, request);
      if (url.pathname === "/api/erp/inventory/receive" && request.method === "POST") return receiveStock(env, request);
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return proxyWorkbench(request);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("Worker request failed", error);
      return errorResponse(error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR", 500, request);
    }
  },
};
