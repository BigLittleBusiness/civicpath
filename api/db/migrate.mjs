// Runs every migration in db/migrations in filename order. Each migration is idempotent, so this is safe on a
// fresh database and on every deploy. New migrations are picked up automatically; stops at the first failure.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(apiDir, 'db', 'migrations');
const migrations = readdirSync(migrationsDir).filter((file) => /^\d+_.+\.mjs$/.test(file)).sort();

for (const file of migrations) {
  console.info(`→ ${file}`);
  const result = spawnSync(process.execPath, [path.join(migrationsDir, file)], { cwd: apiDir, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Migration ${file} failed; later migrations were not run.`);
    process.exit(result.status || 1);
  }
}
console.info(`All ${migrations.length} migrations are up to date.`);
