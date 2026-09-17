/**
 * Importa la población de OpenTermsArchive (organización 'terms-cockpit',
 * colección 'contrib', sus servicios, contratos y versiones) desde
 * `datasheet/poblacion-ICAN/` a CUALQUIER base de Mongo -- pensado para
 * producción, donde `scripts/seedMongo.ts` NO se puede usar porque hace
 * `dropDatabase()` antes de cargar y borraría a los usuarios y contratos
 * reales.
 *
 * La fuente es datasheet/poblacion-ICAN/, que es lo único de datasheet/ que
 * se versiona en git precisamente para esto: poder repoblar o ampliar
 * producción en cualquier momento. Los servicios se añaden ahí con
 * `scripts/addServicesToPopulation.ts`.
 *
 * Este script:
 *   - NUNCA borra nada. Usa la configuración por defecto de mongo-seeding
 *     (dropDatabase: false, dropCollections: false, removeAllDocuments:
 *     false) -- solo hace insertMany.
 *   - Solo toca 5 colecciones: organizations (unicamente la entrada
 *     'terms-cockpit'), contractCollections, services, contracts,
 *     contractVersions.
 *   - Exige --mongo-uri explicito: sin URI, se niega a correr. No hay
 *     ningun valor por defecto que pueda apuntar sin querer a la base
 *     equivocada.
 *   - Exige --yes para de verdad escribir; sin ese flag solo muestra lo que
 *     haria (dry run).
 *   - Usa bulkWriteOptions.ordered=false: si una parte ya existe (por un
 *     intento anterior a medias), sigue insertando el resto en vez de
 *     abortar en el primer duplicado.
 *
 * Uso:
 *   # 1. Ver que se importaria, sin tocar nada:
 *   npx tsx scripts/importOpenTermsPopulation.ts --mongo-uri "mongodb://..."
 *
 *   # 2. Import de verdad:
 *   npx tsx scripts/importOpenTermsPopulation.ts --mongo-uri "mongodb://..." --yes
 */
import fs from 'node:fs';
import path from 'node:path';
import { Seeder } from 'mongo-seeding';
import mongoose from 'mongoose';

const POPULATION_DIR = path.resolve(process.cwd(), '../datasheet/poblacion-ICAN');
const TERMS_COCKPIT_ORG_ID = '6a8b24393b9cca36319a1869';

function parseArgs(argv: string[]): { mongoUri: string | null; confirm: boolean } {
  let mongoUri: string | null = null;
  let confirm = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mongo-uri') mongoUri = argv[++i] ?? null;
    if (argv[i] === '--yes') confirm = true;
  }
  return { mongoUri, confirm };
}

function readEjsonDocs(folder: string): any[] {
  const { EJSON } = mongoose.mongo.BSON;
  const dir = path.join(POPULATION_DIR, folder);
  if (!fs.existsSync(dir)) return [];
  const docs: any[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8').trim();
    if (!raw) continue;
    docs.push(...EJSON.parse(raw, { relaxed: true }));
  }
  return docs;
}

async function main(): Promise<void> {
  const { mongoUri, confirm } = parseArgs(process.argv.slice(2));

  if (!mongoUri) {
    console.error(
      'Uso: npx tsx scripts/importOpenTermsPopulation.ts --mongo-uri "mongodb://..." [--yes]\n' +
        '--mongo-uri es obligatorio: este script no asume ninguna base por defecto.'
    );
    process.exit(1);
  }

  const organizations = readEjsonDocs('organizations').filter(
    (o) => String(o._id) === TERMS_COCKPIT_ORG_ID
  );
  const contractCollections = readEjsonDocs('contractCollections');
  const services = readEjsonDocs('services');
  const contracts = readEjsonDocs('contracts');
  const contractVersions = readEjsonDocs('contractVersions');

  console.log(`Destino: ${mongoUri.replace(/\/\/[^@]*@/, '//<credenciales>@')}`);
  console.log('Se importaría (solo inserción, nada se borra ni se sobreescribe):');
  console.log(`  organizations        ${organizations.length}  (solo 'terms-cockpit')`);
  console.log(`  contractCollections  ${contractCollections.length}`);
  console.log(`  services             ${services.length}`);
  console.log(`  contracts            ${contracts.length}`);
  console.log(`  contractVersions     ${contractVersions.length}`);

  if (organizations.length !== 1) {
    console.error(
      `\nERROR: se esperaba exactamente 1 organización 'terms-cockpit' (id ${TERMS_COCKPIT_ORG_ID}) ` +
        `y se encontraron ${organizations.length}. Abortando sin tocar nada.`
    );
    process.exit(1);
  }

  if (!confirm) {
    console.log('\n(dry run -- nada se ha escrito. Añade --yes para importar de verdad.)');
    return;
  }

  // Comprobación de seguridad final: si la organización 'terms-cockpit' YA
  // existe en el destino, es casi seguro que esto ya se importó antes --
  // paramos y dejamos decidir a quien lo ejecute, en vez de duplicar o
  // fallar a medias.
  const client = await mongoose.createConnection(mongoUri).asPromise();
  const db = client.db!;
  const existing = await db
    .collection('organizations')
    .findOne({ _id: new mongoose.Types.ObjectId(TERMS_COCKPIT_ORG_ID) });
  if (existing) {
    console.error(
      `\nERROR: ya existe una organización con id ${TERMS_COCKPIT_ORG_ID} en el destino ` +
        `(name: '${existing.name}'). Parece que esto ya se importó. Abortando sin tocar nada -- ` +
        'si de verdad quieres reintentar, bórrala a mano primero y vuelve a correr este script.'
    );
    await client.close();
    process.exit(1);
  }
  await client.close();

  const seeder = new Seeder({ database: mongoUri });
  await seeder.import(
    [
      { name: 'organizations', documents: organizations },
      { name: 'contractCollections', documents: contractCollections },
      { name: 'services', documents: services },
      { name: 'contracts', documents: contracts },
      { name: 'contractVersions', documents: contractVersions },
    ],
    { bulkWriteOptions: { ordered: false } }
  );

  console.log('\n==== Importación completada ====');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
