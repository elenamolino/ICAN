import container from '../config/container';
import TermsCockpitClient, { KnownRepo, RepoDocumentSummary } from './clients/TermsCockpitClient';
import OrganizationRepository from '../repositories/mongoose/OrganizationRepository';
import ContractCollectionRepository from '../repositories/mongoose/ContractCollectionRepository';
import ContractRepository from '../repositories/mongoose/ContractRepository';
import { generateSlug } from '../utils/slug-manager';

const ORGANIZATION_NAME = 'terms-cockpit';

// Below this many characters of visible text, the readability extraction is
// treated as having failed (typical of JS-rendered pages like Facebook/X,
// where the static HTML snapshot has no content until client-side scripts run).
const MIN_VISIBLE_TEXT_LENGTH = 50;

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
}

type SyncOutcome = 'contractsCreated' | 'contractsUpdated' | 'contractsSkipped' | 'contractsEmptyContent';

function extractVisibleTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

class TermsCockpitSyncService {
  private client: TermsCockpitClient;
  private organizationRepository: OrganizationRepository;
  private contractCollectionRepository: ContractCollectionRepository;
  private contractRepository: ContractRepository;

  constructor() {
    this.client = container.resolve('termsCockpitClient');
    this.organizationRepository = container.resolve('organizationRepository');
    this.contractCollectionRepository = container.resolve('contractCollectionRepository');
    this.contractRepository = container.resolve('contractRepository');
  }

  async sync({ repos, services }: SyncOptions): Promise<SyncStats> {
    const stats: SyncStats = {
      collectionsSynced: 0,
      contractsCreated: 0,
      contractsUpdated: 0,
      contractsSkipped: 0,
      contractsEmptyContent: 0,
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
          const outcome = await this.syncDocument(organizationId, collectionId, repoName, service, doc);
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

  private buildContractSlug(repoName: string, documentPath: string): string {
    const base = `${repoName} ${documentPath.replace(/\.html?$/i, '').replace(/\//g, ' ')}`;
    return generateSlug(base);
  }

  private async syncDocument(
    organizationId: string,
    collectionId: string,
    repoName: string,
    service: string,
    doc: RepoDocumentSummary
  ): Promise<SyncOutcome> {
    const slug = this.buildContractSlug(repoName, doc.name);
    const sourceVersion = String(doc.last_modified ?? '');

    const existing: any = await this.contractRepository.findBySlugAndOrganization(slug, organizationId);
    if (existing && existing.version === sourceVersion) {
      return 'contractsSkipped';
    }

    const readability = await this.client.getDocumentReadability(repoName, doc.name);

    if (extractVisibleTextLength(readability.content) < MIN_VISIBLE_TEXT_LENGTH) {
      console.warn(
        `Skipping '${repoName}/${doc.name}': readability extraction returned no usable text ` +
          '(likely a JS-rendered page termscockpit cannot scrape statically).'
      );
      return 'contractsEmptyContent';
    }

    const name = `${service} — ${readability.short_title || readability.title || doc.name}`;

    const payload = {
      name,
      slug,
      version: sourceVersion,
      _collectionId: collectionId,
      _organizationId: organizationId,
      url: this.client.documentUrl(repoName, doc.name),
      content: readability.content,
      private: false,
    };

    if (existing) {
      await this.contractRepository.update(existing.id ?? existing._id?.toString(), payload);
      return 'contractsUpdated';
    }

    await this.contractRepository.create({ ...payload, createdAt: new Date() });
    return 'contractsCreated';
  }
}

export default TermsCockpitSyncService;
