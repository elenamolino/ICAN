/**
 * Syncs ToS/Privacy Policy documents from a running termscockpit server into
 * ICAN's Organization/ContractCollection/Contract collections.
 *
 * Usage:
 *   npx tsx scripts/syncTermsCockpit.ts --repos contrib,tosdr [--services Google,Facebook]
 */
import mongoose from 'mongoose';
import { initMongoose } from '../src/main/config/mongoose';
import container from '../src/main/config/container';
import TermsCockpitSyncService from '../src/main/services/TermsCockpitSyncService';

function parseArgs(argv: string[]): { repos: string[]; services?: string[] } {
  const repos: string[] = [];
  let services: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repos') {
      repos.push(...(argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean));
    } else if (argv[i] === '--services') {
      services = (argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  if (repos.length === 0) {
    throw new Error('Usage: syncTermsCockpit.ts --repos <repo1,repo2,...> [--services <service1,service2,...>]');
  }

  return { repos, services };
}

const { repos, services } = parseArgs(process.argv.slice(2));

await initMongoose();

const syncService: TermsCockpitSyncService = container.resolve('termsCockpitSyncService');
const stats = await syncService.sync({ repos, services });

console.log(`Sync complete for [${repos.join(', ')}]:`, stats);

await mongoose.disconnect();
