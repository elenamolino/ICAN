/**
 * Syncs ToS/Privacy Policy documents from a running termscockpit server into
 * ICAN's Organization/ContractCollection/Service/Contract/ContractVersion
 * collections, THEN exports the synced services back out to the committed
 * starter seed under src/main/database/seeders/mongo/ -- in one step.
 *
 * This exists because syncTermsCockpit.ts alone only ever writes to the
 * local Mongo instance: if nobody remembers to also export+commit, that
 * data only ever lived on one machine and disappears the next time someone
 * resets their dev database (this happened to Airbnb).
 *
 * --services is REQUIRED (unlike syncTermsCockpit.ts) -- the seed is a
 * deliberately capped reference set, not "whatever happens to be in
 * termscockpit". This script only touches the seed entries belonging to
 * the services you name; every other service already committed in the seed
 * is left untouched.
 *
 * Usage:
 *   npx tsx scripts/syncAndSeedTermsCockpit.ts --repos contrib --services Airbnb,Google,Spotify
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { initMongoose } from '../src/main/config/mongoose';
import container from '../src/main/config/container';
import TermsCockpitSyncService from '../src/main/services/TermsCockpitSyncService';

const SEED_DIR = path.resolve(process.cwd(), 'src/main/database/seeders/mongo');

function parseArgs(argv: string[]): { repos: string[]; services: string[] } {
  const repos: string[] = [];
  let services: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repos') {
      repos.push(...(argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean));
    } else if (argv[i] === '--services') {
      services = (argv[++i] ?? '').split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  if (repos.length === 0 || services.length === 0) {
    throw new Error(
      'Usage: syncAndSeedTermsCockpit.ts --repos <repo1,repo2,...> --services <service1,service2,...>\n' +
        '--services is required for this command (the committed seed is a capped, deliberate set).',
    );
  }

  return { repos, services };
}

function readSeedArray(folder: string): any[] {
  const file = path.join(SEED_DIR, folder, `${folder}.json`);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf-8').trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function writeSeedArray(folder: string, docs: any[]) {
  const dir = path.join(SEED_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const { EJSON } = mongoose.mongo.BSON;
  const json = EJSON.stringify(docs, undefined, 2, { relaxed: true });
  fs.writeFileSync(path.join(dir, `${folder}.json`), json + '\n');
}

function idStr(v: any): string {
  return typeof v === 'string' ? v : v?.$oid ?? String(v);
}

const { repos, services } = parseArgs(process.argv.slice(2));

await initMongoose();

const syncService: TermsCockpitSyncService = container.resolve('termsCockpitSyncService');
const stats = await syncService.sync({ repos, services });
console.log(`Sync complete for [${repos.join(', ')}]:`, stats);

const db = mongoose.connection.db;
if (!db) throw new Error('no db connection');

// Fetch the fresh state of exactly the services we just synced, plus the
// contracts/versions/collection that hang off them.
// Sorted explicitly everywhere: Mongo's natural find() order isn't stable
// across reads, which would otherwise turn a no-op re-run into a spurious
// full-file diff.
const freshServices = await db
  .collection('services')
  .find({ name: { $in: services } })
  .sort({ _id: 1 })
  .toArray();
const freshServiceIds = new Set(freshServices.map(s => idStr(s._id)));
const freshContracts = await db
  .collection('contracts')
  .find({ _serviceId: { $in: [...freshServiceIds] } })
  .sort({ _id: 1 })
  .toArray();
const freshContractIds = new Set(freshContracts.map(c => idStr(c._id)));
const freshVersions = await db
  .collection('contractVersions')
  .find({ _contractId: { $in: [...freshContractIds] } })
  .sort({ _contractId: 1, capturedAt: 1 })
  .toArray();
const freshCollectionIds = new Set(freshServices.map(s => idStr(s._collectionId)));
const freshCollections = await db
  .collection('contractCollections')
  .find({ _id: { $in: [...freshCollectionIds].map(id => new mongoose.Types.ObjectId(id)) } })
  .sort({ _id: 1 })
  .toArray();

// Merge into the existing committed seed: drop any prior entries for the
// services we just touched, keep everything else untouched, append fresh.
const existingServices = readSeedArray('services').filter(s => !services.includes(s.name));
const existingContracts = readSeedArray('contracts').filter(
  c => !freshContractIds.has(idStr(c._id)) && !freshServiceIds.has(idStr(c._serviceId)),
);
const existingVersions = readSeedArray('contractVersions').filter(v => !freshContractIds.has(idStr(v._contractId)));
const existingCollections = readSeedArray('contractCollections').filter(
  c => !freshCollectionIds.has(idStr(c._id)),
);

const byIdStr = (a: any, b: any) => idStr(a._id).localeCompare(idStr(b._id));

writeSeedArray('services', [...existingServices, ...freshServices].sort(byIdStr));
writeSeedArray('contracts', [...existingContracts, ...freshContracts].sort(byIdStr));
writeSeedArray('contractVersions', [...existingVersions, ...freshVersions].sort(byIdStr));
writeSeedArray('contractCollections', [...existingCollections, ...freshCollections].sort(byIdStr));

console.log(
  `Seed updated for [${services.join(', ')}]: ${freshServices.length} services, ` +
    `${freshContracts.length} contracts, ${freshVersions.length} versions. ` +
    `Review the diff under src/main/database/seeders/mongo/ and commit it.`,
);

await mongoose.disconnect();
