/**
 * Añade servicios nuevos a la población de OpenTermsArchive que vive en
 * `datasheet/poblacion-ICAN/` -- el único sitio del repo desde el que se
 * puebla producción (ver scripts/importOpenTermsPopulation.ts).
 *
 * Hace las dos mitades del trabajo de una tanda en un solo paso:
 *   1. Sincroniza y analiza desde un termscockpit en marcha los servicios
 *      que se le nombren, hacia la Mongo local.
 *   2. Fusiona SOLO esos servicios en datasheet/poblacion-ICAN/.
 *
 * Es estrictamente aditivo: lo que ya estuviera en la población de tandas
 * anteriores se queda tal cual. Volver a pasarlo con --services Netflix
 * reescribe Netflix y no toca los demás. Nada se borra en ningún momento.
 *
 * NO toca src/main/database/seeders/mongo/ a propósito: ese seed es el
 * fixture pequeño de dev/test que carga `seedMongo.ts` con dropDatabase,
 * y no tiene nada que ver con la población de producción.
 *
 * Uso:
 *   npx tsx scripts/addServicesToPopulation.ts --repos contrib --services Vimeo,Zoom
 */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { initMongoose } from '../src/main/config/mongoose';
import container from '../src/main/config/container';
import TermsCockpitSyncService from '../src/main/services/TermsCockpitSyncService';
import { generateSlug } from '../src/main/utils/slug-manager';

const POPULATION_DIR = path.resolve(process.cwd(), '../datasheet/poblacion-ICAN');

function parseArgs(argv: string[]): { repos: string[]; services: string[]; org: string } {
  const repos: string[] = [];
  let services: string[] = [];
  let org = 'terms-cockpit';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repos') {
      repos.push(...(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    } else if (argv[i] === '--services') {
      services = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (argv[i] === '--org') {
      org = argv[++i] ?? org;
    }
  }

  if (repos.length === 0 || services.length === 0) {
    throw new Error(
      'Uso: addServicesToPopulation.ts --repos <repo1,...> --services <servicio1,...> [--org terms-cockpit]\n' +
        '--services es obligatorio: este script añade los servicios que se le nombren, no vuelca la base entera.',
    );
  }

  return { repos, services, org };
}

function idStr(v: any): string {
  return typeof v === 'string' ? v : v?.$oid ?? String(v);
}

function readPopulationArray(folder: string): any[] {
  const file = path.join(POPULATION_DIR, folder, `${folder}.json`);
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf-8').trim();
  return raw ? JSON.parse(raw) : [];
}

function writePopulationArray(folder: string, docs: any[]): void {
  const dir = path.join(POPULATION_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const { EJSON } = mongoose.mongo.BSON;
  fs.writeFileSync(
    path.join(dir, `${folder}.json`),
    EJSON.stringify(docs, undefined, 2, { relaxed: true }) + '\n',
  );
}

/**
 * mongo-seeding concatena todos los .json de una carpeta como una misma
 * colección, así que contractVersions se reparte en un fichero por servicio:
 * el conjunto entero supera los 100 MB/fichero que admite GitHub mucho antes
 * que cualquier servicio suelto. Aquí solo se reescriben los ficheros de los
 * servicios sincronizados -- los del resto ni se abren.
 */
function writeVersionsForService(serviceName: string, docs: any[]): number {
  const dir = path.join(POPULATION_DIR, 'contractVersions');
  fs.mkdirSync(dir, { recursive: true });
  const { EJSON } = mongoose.mongo.BSON;
  const file = path.join(dir, `${generateSlug(serviceName)}.json`);
  fs.writeFileSync(file, EJSON.stringify(docs, undefined, 2, { relaxed: true }) + '\n');
  return fs.statSync(file).size;
}

const byIdStr = (a: any, b: any) => idStr(a._id).localeCompare(idStr(b._id));

const { repos, services, org } = parseArgs(process.argv.slice(2));

await initMongoose();

const syncService: TermsCockpitSyncService = container.resolve('termsCockpitSyncService');
const stats = await syncService.sync({ repos, services });
console.log(`Sync completo para [${repos.join(', ')}]:`, stats);

const db = mongoose.connection.db;
if (!db) throw new Error('no db connection');

const organization = await db.collection('organizations').findOne({ name: org });
if (!organization) throw new Error(`No existe una organización llamada '${org}' en la base local`);

// El sync busca-o-crea la organización y la colección POR NOMBRE, así que una
// Mongo local recién borrada les asigna _id nuevos. Los servicios que ya
// estuvieran en la población seguirían apuntando a los _id viejos y quedaría
// partida en dos mitades que no se referencian. Mejor parar aquí.
const previousOrgs = readPopulationArray('organizations');
const previousOrgId = previousOrgs.find((o) => o.name === org)?._id;
if (previousOrgId && idStr(previousOrgId) !== idStr(organization._id)) {
  throw new Error(
    `La organización '${org}' tiene el _id ${idStr(organization._id)} en la Mongo local, pero la\n` +
      `población guardada usa ${idStr(previousOrgId)}. Añadir servicios ahora la dejaría partida.\n` +
      'Parece que la base local se ha vaciado: vuelve a cargar la población en local antes de seguir:\n' +
      '  npx tsx scripts/importOpenTermsPopulation.ts --mongo-uri "<uri local>" --yes',
  );
}

const freshServices = await db
  .collection('services')
  .find({ name: { $in: services }, _organizationId: organization._id })
  .sort({ _id: 1 })
  .toArray();
const freshServiceIds = new Set(freshServices.map((s) => idStr(s._id)));

const freshContracts = await db
  .collection('contracts')
  .find({ _serviceId: { $in: [...freshServiceIds] } })
  .sort({ _id: 1 })
  .toArray();
const freshContractIds = new Set(freshContracts.map((c) => idStr(c._id)));

const freshVersions = await db
  .collection('contractVersions')
  .find({ _contractId: { $in: [...freshContractIds] } })
  .sort({ _contractId: 1, capturedAt: 1 })
  .toArray();

const freshCollectionIds = new Set(freshServices.map((s) => idStr(s._collectionId)));
const freshCollections = await db
  .collection('contractCollections')
  .find({ _id: { $in: [...freshCollectionIds].map((id) => new mongoose.Types.ObjectId(id)) } })
  .sort({ _id: 1 })
  .toArray();

// Fusión: se descarta de la población lo que pertenezca a los servicios que
// se acaban de sincronizar (para sustituirlo por el estado fresco) y se
// conserva intacto todo lo demás.
const keptServices = readPopulationArray('services').filter((s) => !services.includes(s.name));
const keptContracts = readPopulationArray('contracts').filter(
  (c) => !freshContractIds.has(idStr(c._id)) && !freshServiceIds.has(idStr(c._serviceId)),
);
const keptCollections = readPopulationArray('contractCollections').filter(
  (c) => !freshCollectionIds.has(idStr(c._id)),
);

writePopulationArray('organizations', [organization]);
writePopulationArray('contractCollections', [...keptCollections, ...freshCollections].sort(byIdStr));
writePopulationArray('services', [...keptServices, ...freshServices].sort(byIdStr));
writePopulationArray('contracts', [...keptContracts, ...freshContracts].sort(byIdStr));

const serviceNameById = new Map(freshServices.map((s) => [idStr(s._id), s.name as string]));
const serviceNameByContractId = new Map(
  freshContracts.map((c) => [idStr(c._id), serviceNameById.get(idStr(c._serviceId)) ?? 'unknown']),
);
const versionsByService = new Map<string, any[]>();
for (const name of services) versionsByService.set(name, []);
for (const v of freshVersions) {
  const name = serviceNameByContractId.get(idStr(v._contractId));
  if (name) versionsByService.get(name)?.push(v);
}

console.log(`\nPoblación actualizada en datasheet/poblacion-ICAN/ (org '${org}'):`);
for (const [name, docs] of versionsByService) {
  if (docs.length === 0) {
    console.log(`  ${name.padEnd(28)} sin versiones -- ¿nombre mal escrito o no está en el repo?`);
    continue;
  }
  const bytes = writeVersionsForService(name, docs);
  console.log(`  ${name.padEnd(28)} ${String(docs.length).padStart(4)} versiones  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}

console.log(
  `\nTotales: ${keptServices.length + freshServices.length} servicios, ` +
    `${keptContracts.length + freshContracts.length} contratos. ` +
    'Revisa el diff y haz commit de datasheet/poblacion-ICAN/.',
);

await mongoose.disconnect();
