import { writeFileSync } from 'node:fs';
import { buildMigrationPlan } from './betasys/migration-plan.js';

const snapshotPath = process.argv[2] || '/home/ubuntu/betasys-source/data/database_snapshot.sql';
const outputPath = process.argv[3] || '/home/ubuntu/erp-foundation/migration-reports/betasys-validation.json';
const plan = buildMigrationPlan(snapshotPath, 'VALIDATE_ONLY');
writeFileSync(outputPath, JSON.stringify(plan, null, 2));
console.log(JSON.stringify(plan.summary, null, 2));
