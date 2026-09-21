#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const sourcePath = process.env.BETASYS_SNAPSHOT || path.resolve(process.cwd(), "../betasys/data/database_snapshot.sql");
const outputPath = process.env.BETASYS_IMPORT_OUTPUT || path.resolve(process.cwd(), "artifacts/betasys-import-preview.json");
const apply = process.argv.includes("--apply");
const workerUrl = (process.env.CLOUDFLARE_WORKER_URL || "").replace(/\/$/, "");
const token = process.env.ONEX_API_TOKEN || "";
const companyId = Number(process.env.ONEX_COMPANY_ID || 1);

function parseSqlValues(text) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === "'" && next === "'") { value += "'"; i += 1; continue; }
    if (char === "'") { quoted = !quoted; continue; }
    if (!quoted && char === ",") { values.push(value.trim()); value = ""; continue; }
    value += char;
  }
  values.push(value.trim());
  return values.map((item) => (item.toUpperCase() === "NULL" ? null : item));
}

function readTable(snapshot, table, columns) {
  const pattern = new RegExp("INSERT INTO \\u0060" + table + "\\u0060 \\([^)]*\\) VALUES \\(([^;]*)\\);", "g");
  const rows = [];
  let match;
  while ((match = pattern.exec(snapshot))) {
    const values = parseSqlValues(match[1]);
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null]));
    rows.push(row);
  }
  return rows;
}

function accountType(row) {
  const code = String(row.accountNo || row.sourceId || "");
  const first = code[0];
  return ({ "1": "ASSET", "2": "LIABILITY", "3": "EQUITY", "4": "REVENUE", "5": "EXPENSE" })[first] || "ASSET";
}

function activeState(value) {
  return String(value ?? "0") !== "9" ? 1 : 0;
}

function toNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function uniqueBy(rows, key) {
  const seen = new Set();
  return rows.filter((row) => { const value = String(row[key] || "").trim(); if (!value || seen.has(value)) return false; seen.add(value); return true; });
}

async function postChunk(endpoint, rows, actor) {
  const response = await fetch(`${workerUrl}${endpoint}`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${token}`, "x-onex-actor": actor },
    body: JSON.stringify({ companyId, actor, rows }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${endpoint}:${response.status}:${body.error || "IMPORT_FAILED"}`);
  return body;
}

const snapshot = fs.readFileSync(sourcePath, "utf8");
const rawAccounts = readTable(snapshot, "legacy_accounts", ["id", "sourceId", "accountNo", "parentId", "name", "nameEn", "accountClass", "accountType", "level", "branchId", "state", "balance", "isReport", "syncedAt"]);
const rawItems = readTable(snapshot, "legacy_items", ["id", "sourceId", "itemNo", "barcode", "name", "groupName", "unitName", "stockQty", "averageCost", "salePrice", "warehouse", "state", "syncedAt"]);
const rawParties = readTable(snapshot, "legacy_parties", ["id", "sourceId", "partyNo", "name", "type", "phone", "address", "balance", "branchId", "syncedAt"]);

const accounts = uniqueBy(rawAccounts.map((row) => ({
  sourceId: row.sourceId,
  code: String(row.accountNo || row.sourceId).trim(),
  name: String(row.name || row.nameEn || "").trim(),
  accountType: accountType(row),
  parentCode: row.parentId && row.parentId !== "0" ? String(row.parentId).trim() : undefined,
  currencyCode: "SAR",
  active: activeState(row.state),
})).filter((row) => row.code && row.name), "code");

const items = uniqueBy(rawItems.map((row) => ({
  sourceId: row.sourceId,
  code: String(row.itemNo || row.sourceId).trim(),
  name: String(row.name || "").trim(),
  description: String(row.name || "").trim(),
  unitCode: String(row.unitName || "EA").trim().slice(0, 30) || "EA",
  currencyCode: "SAR",
  stockFlag: 1,
  unitCost: toNumber(row.averageCost).toFixed(6),
  salePrice: toNumber(row.salePrice).toFixed(6),
  revenueAccount: "4100",
  inventoryAccount: "1300",
  cogsAccount: "5100",
  active: activeState(row.state),
  legacyBarcode: row.barcode || undefined,
  legacyGroup: row.groupName || undefined,
})).filter((row) => row.code && row.name), "code");

const customers = uniqueBy(rawParties.filter((row) => String(row.type || "customer").toLowerCase() === "customer").map((row) => ({
  sourceId: row.sourceId,
  code: String(row.partyNo || row.sourceId).trim(),
  legalName: String(row.name || "").trim(),
  currencyCode: "SAR",
  status: activeState(row.state) ? "ACTIVE" : "CLOSED",
  legacyPhone: row.phone || undefined,
  legacyAddress: row.address || undefined,
  legacyBalance: toNumber(row.balance).toFixed(6),
})).filter((row) => row.code && row.legalName), "code");

const preview = {
  source: path.resolve(sourcePath),
  companyId,
  generatedAt: new Date().toISOString(),
  counts: { sourceAccounts: rawAccounts.length, accounts: accounts.length, sourceItems: rawItems.length, items: items.length, sourceParties: rawParties.length, sourceCustomers: customers.length, customers: customers.length },
  mapping: { accountType: "first account digit: 1 asset, 2 liability, 3 equity, 4 revenue, 5 expense; unknown defaults to ASSET", customerFilter: "legacy_parties.type = customer", balances: "preserved as legacy metadata and not posted as opening entries", stock: "preserved in source preview; not posted into stock_balances" },
  rows: { accounts, items, customers },
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(preview, null, 2));
console.log(JSON.stringify({ outputPath, counts: preview.counts, mode: apply ? "apply" : "preview" }, null, 2));

if (apply) {
  if (!workerUrl || !token) throw new Error("--apply requires CLOUDFLARE_WORKER_URL and ONEX_API_TOKEN");
  const actor = process.env.ONEX_ACTOR || "betasys-import";
  const results = [];
  for (const [endpoint, rows] of [["/api/cloud/accounts/import", accounts], ["/api/cloud/items/import", items], ["/api/cloud/customers/import", customers]]) {
    for (let i = 0; i < rows.length; i += 500) results.push({ endpoint, result: await postChunk(endpoint, rows.slice(i, i + 500), actor) });
  }
  console.log(JSON.stringify({ applied: true, results }, null, 2));
}
