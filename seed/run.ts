#!/usr/bin/env node
/**
 * Central seed runner for all microservices.
 * Run from repo root: npm run seed [service?]
 * If no service is given, runs all seeds via workspace scripts.
 */

import { execSync } from 'child_process';

const services = ['logistics', 'order', 'payment', 'audit', 'user'];

function run(service: string): boolean {
  try {
    execSync(`npm run seed --workspace=${service}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    return true;
  } catch {
    return false;
  }
}

const service = process.argv[2];
if (service) {
  if (!services.includes(service)) {
    console.error(`Unknown service: ${service}. Use one of: ${services.join(', ')}`);
    process.exit(1);
  }
  const ok = run(service);
  process.exit(ok ? 0 : 1);
} else {
  console.log('Running all seeds...');
  let failed = 0;
  for (const s of services) {
    if (!run(s)) failed++;
  }
  if (failed > 0) {
    console.error(`\n${failed} seed(s) failed.`);
    process.exit(1);
  }
  console.log('All seeds completed.');
}
