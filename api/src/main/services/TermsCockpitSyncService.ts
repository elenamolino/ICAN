import { createHash } from 'crypto';
import container from '../config/container';
import TermsCockpitClient, { KnownRepo, RepoDocumentSummary, DocumentChange } from './clients/TermsCockpitClient';
import OrganizationRepository from '../repositories/mongoose/OrganizationRepository';
import ContractCollectionRepository from '../repositories/mongoose/ContractCollectionRepository';
import ContractRepository from '../repositories/mongoose/ContractRepository';
import ServiceRepository from '../repositories/mongoose/ServiceRepository';
import ContractVersionService from './ContractVersionService';
import { generateSlug } from '../utils/slug-manager';
import { ContractVersionLabel } from '../types/models/ContractVersion';

const ORGANIZATION_NAME = 'terms-cockpit';

// Below this many characters of visible text, the readability extraction is
// treated as having failed (typical of JS-rendered pages like Facebook/X,
// where the static HTML snapshot has no content until client-side scripts run).
const MIN_VISIBLE_TEXT_LENGTH = 50;

// Maximum number of historical snapshots kept per document: first, last, and
// up to this many intermediate versions with the largest content change.
const MAX_INTERMEDIATE_VERSIONS = 3;

// Intermediate candidates are ranked by insertions+deletions, which scores a
// scraper error page (e.g. a "page failed to load" placeholder) just as high
// as a real content change, since replacing a full document with a stub is a
// huge diff either way. Below this many characters of visible text, a
// candidate is treated as a broken snapshot and skipped in favor of the next
// highest-ranked one, rather than accepted as an "update".
const MIN_SNAPSHOT_TEXT_LENGTH = 500;

export interface SyncOptions {
  repos: string[];
  services?: string[];
}

export interface SyncStats {
  collectionsSynced: number;
  contractsCreated: number;
  contractsUpdated: number;
  contractsSkipped: number;
  contractsEmptyContent: number;
  versionsCreated: number;
  versionsReused: number;
  versionsPruned: number;
}

type SyncOutcome = 'contractsCreated' | 'contractsUpdated' | 'contractsSkipped' | 'contractsEmptyContent';

interface SelectedVersion {
  commitHash: string;
  capturedAt: Date;
  label: ContractVersionLabel;
  insertions: number | null;
  deletions: number | null;
}

function contentHash(html: string): string {
  return createHash('md5').update(html).digest('hex');
}

function extractVisibleTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function labelForIndex(index: number, length: number): ContractVersionLabel {
  if (index === 0) return 'first';
  if (index === length - 1) return 'last';
  return 'intermediate';
}

function toSelected(c: DocumentChange, label: ContractVersionLabel): SelectedVersion {
  return {
    commitHash: c.commit_hash,
    capturedAt: new Date(c.timestamp * 1000),
    label,
    insertions: c.insertions,
    deletions: c.deletions,
  };
}

/**
 * Ranks middle candidates by insertions+deletions (largest change first) and
 * fetches each one's content until `limit` candidates pass validation,
 * skipping two kinds of noise along the way:
 *  - broken snapshots (e.g. a scraper error page) that fail the visible-text
 *    length check;
 *  - candidates whose extracted visible content is byte-identical to a
 *    version already accepted (git-level insertions/deletions on the raw
 *    HTML — markup/script/whitespace churn — don't always change the
 *    readable text, so a "big diff" commit can still be a no-op update).
 * Accepted content is cached so the caller doesn't re-fetch it.
 */
async function pickValidatedIntermediates(
  client: TermsCockpitClient,
  repoName: string,
  documentName: string,
  candidates: DocumentChange[],
  limit: number,
  contentCache: Map<string, string>,
  seenHashes: Set<string>
): Promise<DocumentChange[]> {
  const ranked = [...candidates].sort((a, b) => b.insertions + b.deletions - (a.insertions + a.deletions));
  const picked: DocumentChange[] = [];

  for (const candidate of ranked) {
    if (picked.length >= limit) break;
    const readability = await client.getDocumentReadabilityAt(repoName, documentName, candidate.commit_hash);
    if (extractVisibleTextLength(readability.content) < MIN_SNAPSHOT_TEXT_LENGTH) continue;
    const hash = contentHash(readability.content);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    contentCache.set(candidate.commit_hash, readability.content);
    picked.push(candidate);
  }

  return picked.sort((a, b) => a.timestamp - b.timestamp);
}

async function selectVersions(
  client: TermsCockpitClient,
  repoName: string,
  documentName: string,
  changes: DocumentChange[],
  contentCache: Map<string, string>,
  lastContent: string
): Promise<SelectedVersion[]> {
  if (changes.length <= 1 + MAX_INTERMEDIATE_VERSIONS + 1) {
    return changes.map((c, i) => toSelected(c, labelForIndex(i, changes.length)));
  }

  const first = changes[0];
  const last = changes[changes.length - 1];
  const middle = changes.slice(1, -1);

  const firstReadability = await client.getDocumentReadabilityAt(repoName, documentName, first.commit_hash);
  contentCache.set(first.commit_hash, firstReadability.content);

  const seenHashes = new Set([contentHash(firstReadability.content), contentHash(lastContent)]);
  const validMiddle = await pickValidatedIntermediates(
    client,
    repoName,
    documentName,
    middle,
    MAX_INTERMEDIATE_VERSIONS,
    contentCache,
    seenHashes
  );

  const ordered = [first, ...validMiddle, last];
  return ordered.map((c, i) => toSelected(c, labelForIndex(i, ordered.length)));
}

class TermsCockpitSyncService {
  private client: TermsCockpitClient;
  private organizationRepository: OrganizationRepository;
  private contractCollectionRepository: ContractCollectionRepository;
  private contractRepository: ContractRepository;
  private serviceRepository: ServiceRepository;
  private contractVersionService: ContractVersionService;

  constructor() {
    this.client = container.resolve('termsCockpitClient');
    this.organizationRepository = container.resolve('organizationRepository');
    this.contractCollectionRepository = container.resolve('contractCollectionRepository');
    this.contractRepository = container.resolve('contractRepository');
    this.serviceRepository = container.resolve('serviceRepository');
    this.contractVersionService = container.resolve('contractVersionService');
  }

  async sync({ repos, services }: SyncOptions): Promise<SyncStats> {
    const stats: SyncStats = {
      collectionsSynced: 0,
      contractsCreated: 0,
      contractsUpdated: 0,
      contractsSkipped: 0,
      contractsEmptyContent: 0,
      versionsCreated: 0,
      versionsReused: 0,
      versionsPruned: 0,
    };

    const organization: any = await this.ensureOrganization();
    const organizationId = organization.id ?? organization._id?.toString();
    const knownRepos = await this.client.listRepos();

    for (const repoName of repos) {
      const repoMeta = knownRepos.find(r => r.name === repoName);
      if (!repoMeta) {
        console.warn(`termscockpit does not know repository '${repoName}', skipping.`);
        continue;
      }

      console.log(`Waiting for termscockpit repository '${repoName}' to be ready...`);
      await this.client.waitForRepoReady(repoName);

      const collection: any = await this.ensureCollection(organizationId, repoName, repoMeta);
      const collectionId = collection.id ?? collection._id?.toString();
      stats.collectionsSynced += 1;

      const allServices = await this.client.listServices(repoName);
      const targetServices = services?.length ? allServices.filter(s => services.includes(s)) : allServices;

      for (const service of targetServices) {
        const documents = await this.client.listServiceDocuments(repoName, service);

        for (const doc of documents) {
          const outcome = await this.syncDocument(organizationId, collectionId, repoName, service, doc, stats);
          stats[outcome] += 1;
        }
      }
    }

    return stats;
  }

  private async ensureOrganization() {
    const existing = await this.organizationRepository.findOne({ name: ORGANIZATION_NAME });
    if (existing) return existing;

    return this.organizationRepository.create({
      name: ORGANIZATION_NAME,
      displayName: 'Terms Cockpit',
      description: 'ToS and Privacy Policy snapshots imported from OpenTermsArchive and ToS;DR via termscockpit.',
      isPersonal: false,
    });
  }

  private async ensureCollection(organizationId: string, repoName: string, repoMeta: KnownRepo) {
    const existing = await this.contractCollectionRepository.findByOrganizationAndSlug(organizationId, repoName);
    if (existing) return existing;

    return this.contractCollectionRepository.create({
      name: repoMeta.label,
      slug: repoName,
      description: repoMeta.group,
      _organizationId: organizationId,
      private: false,
    });
  }

  private async ensureService(collectionId: string, organizationId: string, serviceName: string) {
    const slug = generateSlug(serviceName);
    const existing = await this.serviceRepository.findByCollectionAndSlug(collectionId, slug);
    if (existing) return existing;

    return this.serviceRepository.create({
      name: serviceName,
      slug,
      _collectionId: collectionId,
      _organizationId: organizationId,
    });
  }

  private buildContractSlug(repoName: string, documentPath: string): string {
    const base = `${repoName} ${documentPath.replace(/\.html?$/i, '').replace(/\//g, ' ')}`;
    return generateSlug(base);
  }

  private async syncDocument(
    organizationId: string,
    collectionId: string,
    repoName: string,
    service: string,
    doc: RepoDocumentSummary,
    stats: SyncStats
  ): Promise<SyncOutcome> {
    const slug = this.buildContractSlug(repoName, doc.name);
    const sourceVersion = String(doc.last_modified ?? '');

    const existing: any = await this.contractRepository.findBySlugAndOrganization(slug, organizationId);
    if (existing && existing.version === sourceVersion && existing._latestVersionId) {
      return 'contractsSkipped';
    }

    let changes: DocumentChange[] = [];
    try {
      changes = await this.client.listDocumentChanges(repoName, doc.name);
    } catch (err) {
      console.warn(
        `Could not fetch change history for '${repoName}/${doc.name}', falling back to latest snapshot only:`,
        (err as Error).message
      );
      changes = [];
    }

    const lastReadability =
      changes.length === 0
        ? await this.client.getDocumentReadability(repoName, doc.name)
        : await this.client.getDocumentReadabilityAt(repoName, doc.name, changes[changes.length - 1].commit_hash);

    if (extractVisibleTextLength(lastReadability.content) < MIN_VISIBLE_TEXT_LENGTH) {
      console.warn(
        `Skipping '${repoName}/${doc.name}': readability extraction returned no usable text ` +
          '(likely a JS-rendered page termscockpit cannot scrape statically).'
      );
      return 'contractsEmptyContent';
    }

    const lastCommitHash = changes.length === 0 ? lastReadability.commit ?? sourceVersion : changes[changes.length - 1].commit_hash;

    const contentCache = new Map<string, string>([[lastCommitHash, lastReadability.content]]);
    const selected: SelectedVersion[] =
      changes.length === 0
        ? [{ commitHash: lastCommitHash, capturedAt: new Date(), label: 'last', insertions: null, deletions: null }]
        : await selectVersions(this.client, repoName, doc.name, changes, contentCache, lastReadability.content);

    const lastSelected = selected[selected.length - 1];

    const name = `${service} — ${lastReadability.short_title || lastReadability.title || doc.name}`;
    const serviceDoc: any = await this.ensureService(collectionId, organizationId, service);
    const serviceId = serviceDoc.id ?? serviceDoc._id?.toString();

    const contractPayload = {
      name,
      slug,
      version: sourceVersion,
      _collectionId: collectionId,
      _serviceId: serviceId,
      _organizationId: organizationId,
      // termscockpit doesn't expose the original company URL for a document,
      // only its own internal API endpoint, so no link-out is offered.
      url: null,
      private: false,
    };

    let contract: any;
    let outcome: SyncOutcome;
    if (existing) {
      contract = await this.contractRepository.update(existing.id ?? existing._id?.toString(), contractPayload);
      outcome = 'contractsUpdated';
    } else {
      contract = await this.contractRepository.create({ ...contractPayload, createdAt: new Date() });
      outcome = 'contractsCreated';
    }
    const contractId = contract.id ?? contract._id?.toString();

    let lastVersionDoc: any = null;
    for (const v of selected) {
      const isLast = v.commitHash === lastSelected.commitHash;
      const content =
        contentCache.get(v.commitHash) ??
        (await this.client.getDocumentReadabilityAt(repoName, doc.name, v.commitHash)).content;

      const { version, reused } = await this.contractVersionService.upsertVersion(contractId, {
        commitHash: v.commitHash,
        capturedAt: v.capturedAt,
        label: v.label,
        content,
        insertions: v.insertions,
        deletions: v.deletions,
      });

      if (reused) stats.versionsReused += 1;
      else stats.versionsCreated += 1;

      if (isLast) lastVersionDoc = version;
    }

    const keepCommitHashes = selected.map(v => v.commitHash);
    const pruneResult: any = await this.contractVersionService.pruneToSelection(contractId, keepCommitHashes);
    stats.versionsPruned += pruneResult?.deletedCount ?? 0;

    await this.contractRepository.update(contractId, {
      content: lastVersionDoc.content,
      _latestVersionId: lastVersionDoc.id ?? lastVersionDoc._id?.toString(),
      latestVersionSummary: lastVersionDoc.summary ?? undefined,
    });

    return outcome;
  }
}

export default TermsCockpitSyncService;
