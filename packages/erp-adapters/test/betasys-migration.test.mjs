import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildMigrationPlan, parseSnapshot, mapAccount, mapItem, mapOperation, mapParty } from '../dist/betasys/index.js';

const snapshot = fileURLToPath(new URL('./fixtures/betasys-mini.sql', import.meta.url));

test('reads the BetaSys snapshot into the four migration domains', () => {
  const sql = "INSERT INTO `legacy_accounts` (`id`, `sourceId`, `accountNo`, `parentId`, `name`, `balance`) VALUES (1, '1', '1', '0', 'الأصول', '0.00');";
  const parsed = parseSnapshot(sql);
  assert.equal(parsed.get('legacy_accounts').length, 1);
  assert.equal(parsed.get('legacy_accounts')[0].sourceId, 1);
});

test('maps the checked-in fixture into staging without loading production tables', () => {
  const plan = buildMigrationPlan(snapshot, 'VALIDATE_ONLY');
  assert.deepEqual(plan.summary.read, { accounts: 1, items: 2, parties: 1, operations: 1 });
  assert.deepEqual(plan.summary.valid, { accounts: 1, items: 2, parties: 1, operations: 1 });
  assert.equal(plan.summary.inventoryValueApproved, false);
  assert.equal(plan.summary.duplicateSourceIds, 1);
});

test('maps the four legacy row shapes and preserves source identity', () => {
  const account = mapAccount({ sourceId: 'a1', accountNo: '11', parentId: '0', name: 'أصول', balance: '0.00' });
  const item = mapItem({ sourceId: 'i1', name: 'صنف', stockQty: '2.000', averageCost: '10.00', salePrice: '15.00' });
  const party = mapParty({ sourceId: 'p1', name: 'عميل', type: 'customer', balance: '5.00' });
  const operation = mapOperation({ sourceId: 'o1', operationNo: '1', operationDate: '01/01/2024', total: '10.00', tax: '0.00' });
  assert.equal(account.validationStatus, 'VALID');
  assert.equal(item.normalized.inventoryValueCandidate, '20');
  assert.equal(party.normalized.type, 'customer');
  assert.equal(operation.normalized.operationDate, '2024-01-01');
});

test('rejects malformed source records instead of silently loading them', () => {
  assert.equal(mapAccount({ sourceId: '', name: '' }).validationStatus, 'INVALID');
  assert.equal(mapItem({ sourceId: 'i1', name: 'صنف', stockQty: 'bad', averageCost: '1', salePrice: '2' }).validationStatus, 'INVALID');
  assert.equal(mapOperation({ sourceId: 'o1', operationNo: '1', operationDate: 'bad', total: '1', tax: '0' }).validationStatus, 'INVALID');
});
