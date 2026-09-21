import { parseSnapshot, readSnapshot } from './sql-snapshot-reader.js';
import { mapAccount, mapItem, mapOperation, mapParty } from './mapper.js';
import type { MigrationEntityType, MigrationPlan, StagingRecord } from './types.js';

const tableByEntity = { accounts: 'legacy_accounts', items: 'legacy_items', parties: 'legacy_parties', operations: 'legacy_operations' } as const;
const mappers = { accounts: mapAccount, items: mapItem, parties: mapParty, operations: mapOperation } as const;

export function buildMigrationPlan(snapshotPath: string, mode: 'VALIDATE_ONLY' | 'STAGE' | 'LOAD' = 'VALIDATE_ONLY'): MigrationPlan {
  const snapshot = readSnapshot(snapshotPath);
  const parsed = parseSnapshot(snapshot.sql);
  const records: StagingRecord[] = [];
  const read = emptyCounts(); const valid = emptyCounts(); const invalid = emptyCounts(); const warnings = emptyCounts();
  const sourceKeys = new Set<string>(); let duplicateSourceIds = 0; let inventoryValueCandidate = 0;
  for (const entity of Object.keys(tableByEntity) as MigrationEntityType[]) {
    const rows = parsed.get(tableByEntity[entity]) || []; read[entity] = rows.length;
    for (const row of rows) {
      const mapped = mappers[entity](row); const key = `${mapped.sourceSystem}:${mapped.entityType}:${mapped.sourceId}`; if (sourceKeys.has(key)) duplicateSourceIds += 1; sourceKeys.add(key); records.push(mapped); if (mapped.validationStatus === 'VALID') valid[entity] += 1; else invalid[entity] += 1; warnings[entity] += mapped.derivedWarnings.length; if (entity === 'items' && mapped.normalized) inventoryValueCandidate += Number((mapped.normalized as { inventoryValueCandidate: string }).inventoryValueCandidate); }
  }
  return { summary: { sourceSnapshot: snapshotPath, sourceSha256: snapshot.sha256, mode, read, valid, invalid, warnings, inventoryValueCandidate: inventoryValueCandidate.toFixed(2), inventoryValueApproved: false, duplicateSourceIds }, records };
}

function emptyCounts(): Record<MigrationEntityType, number> { return { accounts: 0, items: 0, parties: 0, operations: 0 }; }
