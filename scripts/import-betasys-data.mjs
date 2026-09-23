#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const sourcePath = process.env.BETASYS_SNAPSHOT || path.resolve(process.cwd(), "../betasys/data/database_snapshot.sql");
const outputPath = process.env.BETASYS_IMPORT_OUTPUT || path.resolve(process.cwd(), "artifacts/betasys-import-preview.json");
const chartPath = process.env.ONEX_CHART_OF_ACCOUNTS || path.resolve(process.cwd(), "config/chart-of-accounts/default-ar.json");
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
    rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null])));
  }
  return rows;
}

function toNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function uniqueBy(rows, key) {
  const seen = new Set();
  return rows.filter((row) => {
    const value = String(row[key] || "").trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function accountType(row) {
  const code = String(row.accountNo || row.sourceId || "").trim();
  return ({ "1": "ASSET", "2": "LIABILITY", "3": "EQUITY", "4": "REVENUE", "5": "EXPENSE" })[code[0]] || "ASSET";
}

function activeState(value) {
  return String(value ?? "0") !== "9" ? 1 : 0;
}

function normalBalance(type) {
  return ["LIABILITY", "EQUITY", "REVENUE"].includes(type) ? "CREDIT" : "DEBIT";
}

function loadChart() {
  if (!fs.existsSync(chartPath)) return { accounts: [] };
  return JSON.parse(fs.readFileSync(chartPath, "utf8"));
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
const chart = loadChart();
const rawAccounts = readTable(snapshot, "legacy_accounts", ["id", "sourceId", "accountNo", "parentId", "name", "nameEn", "accountClass", "accountType", "level", "branchId", "state", "balance", "isReport", "syncedAt"]);
const rawItems = readTable(snapshot, "legacy_items", ["id", "sourceId", "itemNo", "barcode", "name", "groupName", "unitName", "stockQty", "averageCost", "salePrice", "warehouse", "state", "syncedAt"]);
const rawParties = readTable(snapshot, "legacy_parties", ["id", "sourceId", "partyNo", "name", "type", "phone", "address", "balance", "branchId", "syncedAt"]);

const accountBySourceId = new Map(rawAccounts.map((row) => [String(row.sourceId || row.id).trim(), String(row.accountNo || row.sourceId || row.id).trim()]));
const parentCodes = new Set(rawAccounts.map((row) => String(row.accountNo || row.sourceId || row.id).trim()));

const accounts = uniqueBy(rawAccounts.map((row) => {
  const type = accountType(row);
  const code = String(row.accountNo || row.sourceId || row.id).trim();
  const parentSource = String(row.parentId || "").trim();
  const parentCode = parentSource && parentSource !== "0" ? (accountBySourceId.get(parentSource) || parentSource) : undefined;
  const allowPosting = parentCodes.has(code) ? 0 : 1;
  return {
    sourceId: String(row.sourceId || row.id).trim(),
    code,
    name: String(row.name || row.nameEn || "").trim(),
    accountType: type,
    parentCode,
    levelNo: Math.max(0, Number(row.level || 0)),
    allowPosting,
    normalBalance: normalBalance(type),
    currencyCode: "SAR",
    active: activeState(row.state),
    legacyCode: code,
    legacySource: "betasys:legacy_accounts",
    openingBalance: toNumber(row.balance).toFixed(6),
    reportAccount: String(row.isReport || "0") === "1",
  };
}).filter((row) => row.code && row.name), "code");

const chartCodes = new Set(chart.accounts.map((row) => row.code));
const items = uniqueBy(rawItems.map((row) => ({
  sourceId: String(row.sourceId || row.id).trim(),
  code: String(row.itemNo || row.sourceId || row.id).trim(),
  name: String(row.name || "").trim(),
  description: String(row.name || "").trim(),
  unitCode: String(row.unitName || "EA").trim().slice(0, 30) || "EA",
  currencyCode: "SAR",
  stockFlag: 1,
  unitCost: toNumber(row.averageCost).toFixed(6),
  salePrice: toNumber(row.salePrice).toFixed(6),
  revenueAccount: chartCodes.has("4100") ? "4100" : "4000",
  inventoryAccount: chartCodes.has("1300") ? "1300" : "1000",
  cogsAccount: chartCodes.has("5100") ? "5100" : "5000",
  active: activeState(row.state),
  legacyBarcode: row.barcode || undefined,
  legacyGroup: row.groupName || undefined,
})).filter((row) => row.code && row.name), "code");

const customers = uniqueBy(rawParties.filter((row) => String(row.type || "customer").toLowerCase() === "customer").map((row) => ({
  sourceId: String(row.sourceId || row.id).trim(),
  code: String(row.partyNo || row.sourceId || row.id).trim(),
  legalName: String(row.name || "").trim(),
  currencyCode: "SAR",
  status: activeState(row.state) ? "ACTIVE" : "CLOSED",
  legacyPhone: row.phone || undefined,
  legacyAddress: row.address || undefined,
  legacyBalance: toNumber(row.balance).toFixed(6),
})).filter((row) => row.code && row.legalName), "code");

const preview = {
  source: path.resolve(sourcePath),
  chartOfAccounts: path.resolve(chartPath),
  companyId,
  generatedAt: new Date().toISOString(),
  counts: { sourceAccounts: rawAccounts.length, accounts: accounts.length, chartAccounts: chart.accounts.length, sourceItems: rawItems.length, items: items.length, sourceParties: rawParties.length, sourceCustomers: customers.length, customers: customers.length },
  mapping: {
    accountParent: "legacy_accounts.parentId is resolved through sourceId to accountNo; orphan parents remain visible for review",
    accountType: "first account digit: 1 asset, 2 liability, 3 equity, 4 revenue, 5 expense; unknown defaults to ASSET",
    posting: "leaf accounts are posting accounts; accounts with children are non-posting",
    customerFilter: "legacy_parties.type = customer",
    balances: "opening balances are preserved in preview metadata and are not posted automatically",
    stock: "legacy quantities and costs remain in source preview; stock posting requires an approved opening-balance batch",
  },
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
