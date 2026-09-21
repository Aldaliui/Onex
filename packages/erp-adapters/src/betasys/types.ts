export type BetaSysTable = 'legacy_accounts' | 'legacy_items' | 'legacy_parties' | 'legacy_operations';
export type MigrationEntityType = 'accounts' | 'items' | 'parties' | 'operations';
export type ValidationStatus = 'VALID' | 'INVALID';

export type SourceRow = Readonly<Record<string, string | number | boolean | null>>;

export type StagingRecord<T = Record<string, unknown>> = Readonly<{
  sourceSystem: 'BETASYS';
  sourceId: string;
  entityType: MigrationEntityType;
  sourceHash: string;
  raw: SourceRow;
  normalized: T | null;
  validationStatus: ValidationStatus;
  validationErrors: readonly string[];
  derivedWarnings: readonly string[];
}>;

export type MigrationSummary = Readonly<{
  sourceSnapshot: string;
  sourceSha256: string;
  mode: 'VALIDATE_ONLY' | 'STAGE' | 'LOAD';
  read: Record<MigrationEntityType, number>;
  valid: Record<MigrationEntityType, number>;
  invalid: Record<MigrationEntityType, number>;
  warnings: Record<MigrationEntityType, number>;
  inventoryValueCandidate: string;
  inventoryValueApproved: false;
  duplicateSourceIds: number;
}>;

export type MigrationPlan = Readonly<{
  summary: MigrationSummary;
  records: readonly StagingRecord[];
}>;
