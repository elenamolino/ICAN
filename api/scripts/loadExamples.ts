/**
 * Loads the example Customer Agreements into a collection, through the public API.
 * Safe to run again: a version whose text is already there is reused, not duplicated.
 *
 *   ICAN_URL=https://ican.score.us.es ICAN_API_KEY=sk-... ORGANIZATION_ID=... \
 *     npx tsx scripts/loadExamples.ts [scripts/examples/fis-examples.json]
 *
 * ORGANIZATION_ID is the organization that keeps the collection: for the course examples,
 * FIS – Fundamentos de Ingeniería del Software, so that every year's students see them.
 * The API key must belong to an owner or admin of the organization, with scope ALL on it.
 * Versions without a stored analysis are analysed by the API's classifier on the way, or by the
 * one at ANALYSE_URL (such as http://localhost:8080) when it is set. With REPLACE_CHANGED=1, a
 * version already there whose text or name differs from the example's is deleted and saved again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface ExampleVersion {
  number: string;
  name: string;
  date: string;
  text: string;
  analysis?: { summary: unknown; clauses: unknown[] };
}
interface ExampleDocument {
  service: string;
  company: string;
  title: string;
  /** The contract's name, when it is not "Company — Title". */
  name?: string;
  documentType: string;
  url?: string;
  versions: ExampleVersion[];
}
interface ExampleFile {
  collection: string;
  description?: string;
  documents: ExampleDocument[];
  /** Per service name: where its pricing is published (its Pricing card) and the provider's own page. */
  services?: Record<string, { pricingUrl?: string; pricingSourceUrl?: string }>;
}

const base = (process.env.ICAN_URL ?? 'http://localhost:8080').replace(/\/$/, '') + '/api/v1';
const apiKey = process.env.ICAN_API_KEY;
const organizationId = process.env.ORGANIZATION_ID;
// Another iCan to analyse the texts with, such as a local one, when the target's classifier is too slow for long texts.
// With REPLACE_CHANGED=1, a version already there whose text or name is not the example's is replaced.
const replaceChanged = process.env.REPLACE_CHANGED === '1';
const analyseBase = process.env.ANALYSE_URL ? process.env.ANALYSE_URL.replace(/\/$/, '') + '/api/v1' : base;
const file = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'examples', 'fis-examples.json');

async function call<T = any>(method: string, route: string, body?: unknown, apiBase = base): Promise<T> {
  let response: Response | undefined;
  // A long text can keep the classifier busy past what the network waits: try again, up to three times.
  for (let attempt = 1; !response; attempt++) {
    try {
      response = await fetch(apiBase + route, {
        method,
        // The key belongs to the target; classifying is open, so another iCan gets none.
        headers: { 'Content-Type': 'application/json', ...(apiBase === base ? { 'x-api-key': apiKey! } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error: any) {
      if (attempt === 3) throw new Error(`${method} ${route}: ${error.message}`);
      console.log(`  ${method} ${route} failed (${error.message}), trying again`);
      await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
    }
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${JSON.stringify(data)}`);
  return data as T;
}

async function main() {
  if (!apiKey || !organizationId) {
    throw new Error('Set ICAN_API_KEY and ORGANIZATION_ID (and ICAN_URL for anything but a local API).');
  }
  const examples: ExampleFile = JSON.parse(fs.readFileSync(file, 'utf8'));

  const { collections } = await call('GET', `/contractCollections/${organizationId}?limit=100`);
  let collection = collections.find((c: any) => c.name === examples.collection);
  if (!collection) {
    collection = await call('POST', `/contractCollections/${organizationId}`, {
      name: examples.collection,
      description: examples.description,
      private: false,
    });
    console.log(`Created the collection "${examples.collection}"`);
  }
  const collectionId = collection.id ?? collection._id;

  for (const doc of examples.documents) {
    const name = doc.name ?? `${doc.company} — ${doc.title}`;
    for (const version of doc.versions) {
      const services: any[] = (await call('GET', `/services?collectionId=${collectionId}`)).services;
      const service = services.find(s => s.name === doc.service);
      const { contracts } = await call('GET', `/contracts/${organizationId}?collection=${collection.slug}&limit=200`);
      // By name, or by its official page: a contract renamed in iCan is still the same one.
      const contract = contracts.find(
        (c: any) => c.name === name || (doc.url && c.url === doc.url && c.service?.name === doc.service)
      );
      // A version already there is not analysed again.
      if (contract) {
        const { versions } = await call('GET', `/contracts/${organizationId}/${contract.slug}/versions`);
        const existing = versions.find((v: any) => v.number === version.number);
        if (existing) {
          const id = existing.id ?? existing._id;
          const stored = replaceChanged
            ? await call('GET', `/contracts/${organizationId}/${contract.slug}/versions/${id}`)
            : null;
          if (!stored || (stored.content.trim() === version.text.trim() && (stored.name ?? null) === (version.name ?? null))) {
            console.log(`${name}: v${version.number} already there`);
            continue;
          }
          await call('DELETE', `/contracts/${organizationId}/${contract.slug}/versions/${id}`);
          console.log(`${name}: v${version.number} has a new text or name, replacing it`);
        }
      }
      const analysis = version.analysis ?? (await call('POST', '/analysis/ai-classify', { text: version.text }, analyseBase));

      await call('POST', `/contracts/${organizationId}/ai-classify/save`, {
        collectionId,
        ...(service ? { serviceId: service.id ?? service._id } : { serviceName: doc.service }),
        ...(contract ? { contractId: contract.id } : { contractName: name, provider: doc.company, title: doc.title }),
        date: new Date(version.date).toISOString(),
        text: version.text,
        summary: analysis.summary,
        clauses: analysis.clauses,
        documentType: doc.documentType,
        ...(doc.url ? { url: doc.url } : {}),
        versionNumber: version.number,
        versionName: version.name,
      });
      console.log(`${name}: v${version.number} (${version.name})`);
    }
    // The API names a new contract "Company — Title"; the example may want another name.
    const { contracts } = await call('GET', `/contracts/${organizationId}?collection=${collection.slug}&limit=200`);
    const saved = contracts.find(
      (c: any) => c.name === name || (doc.url && c.url === doc.url && c.service?.name === doc.service)
    );
    if (saved && saved.name !== name) {
      await call('PUT', `/contracts/${organizationId}/${saved.slug}`, { name });
      console.log(`${saved.name} renamed to ${name}`);
    }
  }
  const services: any[] = (await call('GET', `/services?collectionId=${collectionId}`)).services;
  for (const [name, settings] of Object.entries(examples.services ?? {})) {
    const service = services.find(s => s.name === name);
    if (!service || (!settings.pricingUrl && !settings.pricingSourceUrl)) continue;
    await call('PUT', `/services/${service.id ?? service._id}`, settings);
    console.log(`${name}: pricing at ${settings.pricingUrl ?? '-'} (official ${settings.pricingSourceUrl ?? '-'})`);
  }
  console.log(`Done: ${examples.documents.length} documents in "${examples.collection}".`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
