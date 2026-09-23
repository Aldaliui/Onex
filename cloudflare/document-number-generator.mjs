function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function safeComponent(value, fallback) {
  const text = String(value ?? fallback).trim().toUpperCase();
  return /^[A-Z0-9_-]{1,80}$/.test(text) ? text : fallback;
}

export function documentScope(request, body = {}) {
  const header = (name) => request.headers.get(name);
  return {
    companyId: nonNegativeInteger(body.companyId ?? header("x-onex-company-id"), 1) || 1,
    branchId: nonNegativeInteger(body.branchId ?? header("x-onex-branch-id"), 0),
    periodId: nonNegativeInteger(body.periodId ?? header("x-onex-period-id"), 0),
  };
}

/**
 * Returns the three statements that must be placed in one D1 batch:
 * seed the scope, read its current value into the document INSERT, then bump
 * the counter. D1 commits or rolls back the whole batch, so a failed insert
 * does not consume a number and concurrent batches cannot reuse one.
 */
export function documentNumberBatch(db, { companyId, branchId, periodId, documentType, prefix }) {
  const company = nonNegativeInteger(companyId, 1) || 1;
  const branch = nonNegativeInteger(branchId, 0);
  const period = nonNegativeInteger(periodId, 0);
  const type = safeComponent(documentType, "DOC");
  const normalizedPrefix = safeComponent(prefix, `C${company}-B${branch}-${type}-P${period}`);
  const scope = [company, branch, period, type];
  return {
    companyId: company,
    branchId: branch,
    periodId: period,
    documentType: type,
    prefix: normalizedPrefix,
    seed: db.prepare(`
      INSERT OR IGNORE INTO document_sequences
        (companyId, branchId, periodId, documentType, prefix, nextNumber)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(...scope, normalizedPrefix),
    expression: `(SELECT prefix || '-' || printf('%06d', nextNumber)
      FROM document_sequences
      WHERE companyId = ${company} AND branchId = ${branch}
        AND periodId = ${period} AND documentType = '${type}')`,
    increment: db.prepare(`
      UPDATE document_sequences
      SET nextNumber = nextNumber + 1, updatedAt = CURRENT_TIMESTAMP
      WHERE companyId = ? AND branchId = ? AND periodId = ? AND documentType = ?
    `).bind(...scope),
  };
}

export function isSafeDocumentNumber(value) {
  return typeof value === "string" && value.length <= 80 && /^[A-Z0-9_-]+$/.test(value);
}
