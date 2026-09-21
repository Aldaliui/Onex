import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { BetaSysTable, SourceRow } from './types.js';

const TABLES = new Set<BetaSysTable>(['legacy_accounts', 'legacy_items', 'legacy_parties', 'legacy_operations']);

function parseValueList(input: string): Array<string | number | boolean | null> {
  const values: Array<string | number | boolean | null> = [];
  let token = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === "'" && input[i + 1] === "'") { token += "'"; i += 1; continue; }
      if (char === "'" && input[i - 1] !== '\\') { quoted = false; continue; }
      token += char === '\\' && input[i + 1] ? input[++i] : char;
      continue;
    }
    if (char === "'") { quoted = true; continue; }
    if (char === ',') { values.push(coerce(token.trim())); token = ''; continue; }
    token += char;
  }
  values.push(coerce(token.trim()));
  return values;
}

function coerce(value: string): string | number | boolean | null {
  if (value.toUpperCase() === 'NULL') return null;
  if (value === '0' || value === '1') return Number(value);
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseSnapshot(sql: string): Map<BetaSysTable, SourceRow[]> {
  const result = new Map<BetaSysTable, SourceRow[]>();
  for (const table of TABLES) result.set(table, []);
  const statement = /INSERT INTO `([^`]+)`\s*\(([^)]+)\) VALUES \((.*)\);/g;
  for (const match of sql.matchAll(statement)) {
    const table = match[1] as BetaSysTable;
    if (!TABLES.has(table)) continue;
    const columnText = match[2];
    const valueText = match[3];
    if (columnText === undefined || valueText === undefined) throw new Error(`عبارة INSERT ناقصة في ${table}`);
    const columns = columnText.split(',').map(column => column.trim().replaceAll('`', ''));
    const values = parseValueList(valueText);
    if (columns.length !== values.length) throw new Error(`عدد الأعمدة والقيم غير متطابق في ${table}`);
    const row: Record<string, string | number | boolean | null> = {};
    columns.forEach((column, index) => { row[column] = values[index] ?? null; });
    result.get(table)?.push(row);
  }
  return result;
}

export function readSnapshot(path: string) {
  const buffer = readFileSync(path);
  return { sql: buffer.toString('utf8'), sha256: createHash('sha256').update(buffer).digest('hex') };
}

export function sourceHash(row: SourceRow): string {
  return createHash('sha256').update(JSON.stringify(row, Object.keys(row).sort())).digest('hex');
}
