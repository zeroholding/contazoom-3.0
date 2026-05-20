#!/usr/bin/env node
/**
 * build.js - Custom build script that handles Prisma migration state
 * before building Next.js. Resolves any failed migrations gracefully.
 */
const { execSync } = require('child_process');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  try {
    execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit' });
    return true;
  } catch (e) {
    if (opts.allowFail) {
      if (!opts.silent) console.log(`  (command failed, continuing anyway)`);
      return false;
    }
    process.exit(1);
  }
}

// 1. Generate Prisma Client
run('npx prisma generate');

// 2. Resolve any previously failed migrations so they can be re-applied.
//    This handles the case where a migration was attempted but failed mid-way,
//    leaving the _prisma_migrations table in a failed state.
const failedMigrations = [
  '20260520165058_add_subfolder_support',
];

for (const migration of failedMigrations) {
  run(`npx prisma migrate resolve --rolled-back ${migration}`, { allowFail: true, silent: true });
}

// 3. Apply all pending migrations
run('npx prisma migrate deploy');

// 4. Build Next.js
run('npx next build');
