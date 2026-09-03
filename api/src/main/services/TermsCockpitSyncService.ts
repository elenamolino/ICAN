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
import { labelForIndex } from '../utils/contractVersionLabels';

const ORGANIZATION_NAME = 'terms-cockpit';

// Below this many characters of visible text, a snapshot is treated as having
// no usable content at all (typical of a JS-rendered page termscockpit can't
// scrape statically, or a document with zero history).
const MIN_VISIBLE_TEXT_LENGTH = 50;

// Maximum number of historical snapshots kept per document: first, last, and
// up to this many intermediate versions with the largest content change.
const MAX_INTERMEDIATE_VERSIONS = 3;

// An intermediate candidate is treated as broken/anomalous — not a real
// content state — if its visible text is below this fraction of the
// document's "first" snapshot length. A coarse floor: catches things like a
// scraper error page without being sensitive to a document's size changing
// a lot over years of real history.
const MIN_SNAPSHOT_RATIO = 0.4;

// When picking "last", a candidate is only trusted if its length roughly
// agrees with its immediate predecessor's (neither is less than this
// fraction of the other) — one real content state corroborated by its
// neighbor, rather than a lone commit compared against a possibly
// years-old "first". Catches e.g. a scraper hitting a login wall on the
// most recent commit: the raw diff looks "big" and the absolute length can
// still be a few thousand characters, but it doesn't match anything nearby.
const LAST_NEIGHBOR_CONSISTENCY_RATIO = 0.5;

// How many commits to walk back from the tip of the history looking for a
// "last" snapshot that isn't broken, before giving up and accepting the tip
// as a best-effort fallback.
const MAX_LAST_BACKSCAN = 10;

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

function contentHash(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

function extractVisibleTextLength(text: string): number {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

function documentTitle(documentName: string): string {
  const base = documentName.split('/').pop() ?? documentName;
  return base.replace(/\.(html?|md)$/i, '');
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

async function fetchContent(
  client: TermsCockpitClient,
  repoName: string,
  documentName: string,
  commitHash: string,
  contentCache: Map<string, string>
): Promise<string> {
  const cached = contentCache.get(commitHash);
  if (cached !== undefined) return cached;
  const doc = await client.getDocumentContentAt(repoName, documentName, commitHash);
  contentCache.set(commitHash, doc.content);
  return doc.content;
}

/**
 * Ranks middle candidates by insertions+deletions (largest change first) and
 * fetches each one's content until `limit` candidates pass validation,
 * skipping two kinds of noise along the way:
 *  - broken/anomalous snapshots (visible text below `minLen`);
 *  - candidates whose extracted visible content is byte-identical to a
 *    version already accepted (git-level diffs on the underlying file —
 *    markup/token/whitespace churn — don't always change the readable text,
 *    so a "big diff" commit can still be a no-op update).
 * Accepted content is cached so the caller doesn't re-fetch it.
 */
async function pickValidatedIntermediates(
  client: TermsCockpitClient,
  repoName: string,
  documentName: string,
  candidates: DocumentChange[],
  limit: number,
  contentCache: Map<string, string>,
  seenHashes: Set<string>,
  minLen: number
): Promise<DocumentChange[]> {
  const ranked = [...candidates].sort((a, b) => b.insertions + b.deletions - (a.insertions + a.deletions));
  const picked: DocumentChange[] = [];

  for (const candidate of ranked) {
    if (picked.length >= limit) break;
    const content = await fetchContent(client, repoName, documentName, candidate.commit_hash, contentCache);
    if (extractVisibleTextLength(content) < minLen) continue;
    const hash = contentHash(content);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    picked.push(candidate);
  }

  return picked.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Picks up to 5 snapshots (first, last, up to 3 intermediates) out of a
 * document's full change history. `changes` must be non-empty and sorted
 * oldest-first.
 */
async function selectVersions(
  client: TermsCockpitClient,
  repoName: string,
  documentName: string,
  changes: DocumentChange[],
  contentCache: Map<string, string>
): Promise<SelectedVersion[]> {
  if (changes.length === 1) {
    await fetchContent(client, repoName, documentName, changes[0].commit_hash, contentCache);
    return [toSelected(changes[0], 'last')];
  }

  const first = changes[0];
  const firstContent = await fetchContent(client, repoName, documentName, first.commit_hash, contentCache);
  const minLen = Math.max(MIN_VISIBLE_TEXT_LENGTH, extractVisibleTextLength(firstContent) * MIN_SNAPSHOT_RATIO);

  // Walk back from the tip looking for a "last" that isn't broken (e.g. the
  // live document currently redirects to a login wall). A candidate is only
  // trusted once its length roughly agrees with its immediate predecessor's —
  // one real content state corroborated by a neighbor, not a lone outlier.
  // Falls back to the literal tip if nothing in the backscan window qualifies.
  let lastIndex = changes.length - 1;
  let lastContent: string | null = null;
  let nextContent = await fetchContent(client, repoName, documentName, changes[lastIndex].commit_hash, contentCache);
  let nextLen = extractVisibleTextLength(nextContent);

  for (let attempts = 0; lastIndex > 0 && attempts < MAX_LAST_BACKSCAN; lastIndex -= 1, attempts += 1) {
    const prevContent = await fetchContent(client, repoName, documentName, changes[lastIndex - 1].commit_hash, contentCache);
    const prevLen = extractVisibleTextLength(prevContent);
    const consistent = Math.min(nextLen, prevLen) / Math.max(nextLen, prevLen) >= LAST_NEIGHBOR_CONSISTENCY_RATIO;

    if (nextLen >= minLen && consistent) {
      lastContent = nextContent;
      break;
    }

    nextContent = prevContent;
    nextLen = prevLen;
  }
  if (lastContent === null) {
    lastIndex = changes.length - 1;
    lastContent = await fetchContent(client, repoName, documentName, changes[lastIndex].commit_hash, contentCache);
  }

  const last = changes[lastIndex];
  const middle = changes.slice(1, lastIndex);
  const seenHashes = new Set([contentHash(firstContent), contentHash(lastContent)]);
  const validMiddle = await pickValidatedIntermediates(
    client,
    repoName,
    documentName,
    middle,
    MAX_INTERMEDIATE_VERSIONS,
    contentCache,
    seenHashes,
    minLen
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
      name: `${repoMeta.group} - ${repoName}`,
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
    const base = `${repoName} ${documentPath.replace(/\.(html?|md)$/i, '').replace(/\//g, ' ')}`;
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

    const contentCache = new Map<string, string>();
    let selected: SelectedVersion[];

    if (changes.length === 0) {
      const latest = await this.client.getDocumentContent(repoName, doc.name);
      const commitHash = latest.commit ?? sourceVersion;
      contentCache.set(commitHash, latest.content);
      selected = [{ commitHash, capturedAt: new Date(), label: 'last', insertions: null, deletions: null }];
    } else {
      selected = await selectVersions(this.client, repoName, doc.name, changes, contentCache);
    }

    const lastSelected = selected[selected.length - 1];
    const lastContent = contentCache.get(lastSelected.commitHash)!;

    if (extractVisibleTextLength(lastContent) < MIN_VISIBLE_TEXT_LENGTH) {
      console.warn(
        `Skipping '${repoName}/${doc.name}': extraction returned no usable text ` +
          '(likely a JS-rendered page termscockpit cannot scrape statically, or the document is currently unreachable).'
      );
      return 'contractsEmptyContent';
    }

    const name = `${service} — ${documentTitle(doc.name)}`;
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
      const content = await fetchContent(this.client, repoName, doc.name, v.commitHash, contentCache);

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
