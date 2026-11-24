import { createHash } from 'crypto';
import container from '../config/container';
import ContractCollectionRepository from '../repositories/mongoose/ContractCollectionRepository';
import ContractRepository from '../repositories/mongoose/ContractRepository';
import ServiceRepository from '../repositories/mongoose/ServiceRepository';
import ServiceService from './ServiceService';
import ContractService from './ContractService';
import ContractVersionService from './ContractVersionService';
import PermissionService from './PermissionService';
import { PermissionEngine } from '../policies/PermissionEngine';
import { LeanUser } from '../types/models/User';
import { AnalysisSummary, ClauseAnalysis } from '../types/services/AnalysisService';
import { SaveOntologyAnalysisPayload } from '../types/services/OntologyAnalysisService';
import ContractVersionRepository from '../repositories/mongoose/ContractVersionRepository';

function contentHash(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

export interface SaveAnalysisPayload {
  collectionId: string;
  serviceId?: string;
  serviceName?: string;
  contractId?: string;
  contractName?: string;
  // When set (only valid alongside contractId), attaches this analysis to an
  // already-existing version of that contract instead of creating/reusing a
  // version keyed by content hash — lets the same version carry both an AI
  // Classify and an Ontology Analysis result even if the two texts differ.
  versionId?: string;
  /** Name for the new version, such as "Adds a refund policy". */
  versionName?: string;
  /** Number of the new version: "0.1". */
  versionNumber?: string;
  /** What the document is; on an existing contract, it changes its type. */
  documentType?: string;
  /** Where the provider publishes the document. On an existing contract, it replaces the one it had. */
  url?: string;
  /** Version of `contractId` the new one was edited from, to draw it as a branch. */
  parentVersionId?: string;
  /** Who provides the service. Kept as the contract's company; the name carries the service. */
  provider?: string;
  title?: string;
  date: string;
  text: string;
  summary: AnalysisSummary;
  clauses: ClauseAnalysis[];
}

class AnalysisSaveService {
  private contractCollectionRepository: ContractCollectionRepository;
  private contractRepository: ContractRepository;
  private serviceRepository: ServiceRepository;
  private serviceService: ServiceService;
  private contractService: ContractService;
  private contractVersionService: ContractVersionService;
  private contractVersionRepository: ContractVersionRepository;
  private permissionService: PermissionService;
  private permissionEngine: PermissionEngine;

  constructor() {
    this.contractCollectionRepository = container.resolve('contractCollectionRepository');
    this.contractRepository = container.resolve('contractRepository');
    this.serviceRepository = container.resolve('serviceRepository');
    this.serviceService = container.resolve('serviceService');
    this.contractService = container.resolve('contractService');
    this.contractVersionService = container.resolve('contractVersionService');
    this.contractVersionRepository = container.resolve('contractVersionRepository');
    this.permissionService = container.resolve('permissionService');
    this.permissionEngine = new PermissionEngine();
  }

  async saveAiClassifyResult(organizationId: string, reqUser: LeanUser, payload: SaveAnalysisPayload) {
    const collection: any = await this.contractCollectionRepository.findById(payload.collectionId);
    if (!collection || String(collection.organization?.id) !== String(organizationId)) {
      throw new Error('NOT FOUND: Collection not found in this organization');
    }

    const service: any = payload.serviceId
      ? await this._resolveExistingService(payload.serviceId, payload.collectionId)
      : await this.serviceService.findOrCreate(payload.collectionId, organizationId, payload.serviceName!);
    const serviceId = service.id ?? service._id?.toString();

    const contract: any = payload.contractId
      ? await this._resolveExistingContract(payload.contractId, organizationId, payload.collectionId, reqUser)
      : await this.contractService.create(
          {
            name: `${service.name} — ${payload.title}`,
            company: payload.provider?.trim() || null,
            content: payload.text,
            serviceId,
            documentType: payload.documentType ?? null,
            url: payload.url,
          },
          organizationId,
          // Inherit the collection's visibility: a contract saved into a private
          // collection must not be readable through the public contract endpoints.
          Boolean(collection.private),
          reqUser,
          payload.collectionId
        );
    const contractId = contract.id ?? contract._id?.toString();
    // Checked above: who saves a version of an existing contract may edit it.
    if (payload.contractId) {
      const changes = {
        ...(payload.documentType && contract.documentType !== payload.documentType && { documentType: payload.documentType }),
        ...(payload.url && contract.url !== payload.url && { url: payload.url }),
        ...(payload.provider?.trim() && contract.company !== payload.provider.trim() && { company: payload.provider.trim() }),
      };
      if (Object.keys(changes).length) await this.contractRepository.update(contractId, changes);
    }

    if (payload.versionId) {
      await this.contractVersionService.attachAnalysis(contractId, payload.versionId, {
        content: payload.text,
        precomputedAnalysis: { summary: payload.summary, clauses: payload.clauses },
      });
    } else {
      if (payload.parentVersionId) {
        const parent: any = await this.contractVersionRepository.findById(payload.parentVersionId);
        if (!parent || String(parent._contractId) !== String(contractId)) {
          throw new Error('NOT FOUND: Parent version not found in this contract');
        }
      }
      const commitHash = contentHash(payload.text);
      await this.contractVersionService.upsertVersion(contractId, {
        commitHash,
        capturedAt: new Date(payload.date),
        label: 'last',
        content: payload.text,
        name: payload.versionName?.trim() || null,
        number: payload.versionNumber ?? null,
        parentVersionId: payload.parentVersionId ?? null,
        precomputedAnalysis: { summary: payload.summary, clauses: payload.clauses },
      });
      await this.contractVersionService.relabelAllByDate(contractId);
    }

    return this._finalizeSave(organizationId, contractId);
  }

  async saveOntologyAnalysisResult(
    organizationId: string,
    reqUser: LeanUser,
    payload: SaveOntologyAnalysisPayload
  ) {
    const collection: any = await this.contractCollectionRepository.findById(payload.collectionId);
    if (!collection || String(collection.organization?.id) !== String(organizationId)) {
      throw new Error('NOT FOUND: Collection not found in this organization');
    }

    const service: any = payload.serviceId
      ? await this._resolveExistingService(payload.serviceId, payload.collectionId)
      : await this.serviceService.findOrCreate(payload.collectionId, organizationId, payload.serviceName!);
    const serviceId = service.id ?? service._id?.toString();

    const contract: any = payload.contractId
      ? await this._resolveExistingContract(payload.contractId, organizationId, payload.collectionId, reqUser)
      : await this.contractService.create(
          {
            name: `${service.name} — ${payload.title}`,
            company: payload.provider?.trim() || null,
            content: payload.text ?? payload.report.clauses.map(c => c.clause_text).join('\n\n'),
            serviceId,
          },
          organizationId,
          Boolean(collection.private),
          reqUser,
          payload.collectionId
        );
    const contractId = contract.id ?? contract._id?.toString();
    const content = payload.text?.trim()
      ? payload.text
      : payload.report.clauses.map(c => c.clause_text).join('\n\n');

    if (payload.versionId) {
      await this.contractVersionService.attachAnalysis(contractId, payload.versionId, {
        content,
        precomputedOntologyReport: payload.report,
      });
    } else {
      const commitHash = contentHash(content);
      await this.contractVersionService.upsertVersion(contractId, {
        commitHash,
        capturedAt: new Date(payload.date),
        label: 'last',
        content,
        precomputedOntologyReport: payload.report,
      });
      await this.contractVersionService.relabelAllByDate(contractId);
    }

    return this._finalizeSave(organizationId, contractId);
  }

  // Shared close-out for both save flows: refresh the contract's denormalized
  // "latest version" snapshot from whatever version is actually labeled
  // 'last' right now (not necessarily the one just written — e.g. attaching
  // to an explicitly-picked older version, or backfilling an older snapshot,
  // leaves a different version as 'last').
  private async _finalizeSave(organizationId: string, contractId: string) {
    const versions: any[] = await this.contractVersionService.listByContract(contractId);
    const lastVersionSummary = versions.find(v => v.label === 'last') ?? versions[versions.length - 1];
    const lastVersion: any = lastVersionSummary
      ? await this.contractVersionService.getById(contractId, String(lastVersionSummary._id ?? lastVersionSummary.id))
      : null;

    if (lastVersion) {
      await this.contractRepository.update(contractId, {
        content: lastVersion.content,
        _latestVersionId: lastVersion._id ?? lastVersion.id,
        latestVersionSummary: lastVersion.summary ?? undefined,
      });
    }

    const savedContract: any = await this.contractRepository.findById(contractId);

    return {
      organizationId,
      contractSlug: savedContract.slug,
      versionId: lastVersion?._id ?? lastVersion?.id,
    };
  }

  private async _resolveExistingService(serviceId: string, collectionId: string) {
    const service = await this.serviceRepository.findById(serviceId);
    if (!service || String((service as any)._collectionId) !== String(collectionId)) {
      throw new Error('NOT FOUND: Service not found in this collection');
    }
    return service;
  }

  private async _resolveExistingContract(
    contractId: string,
    organizationId: string,
    collectionId: string,
    reqUser: LeanUser
  ) {
    const contract: any = await this.contractRepository.findById(contractId);
    if (
      !contract ||
      String(contract._organizationId) !== String(organizationId) ||
      String(contract._collectionId) !== String(collectionId)
    ) {
      throw new Error('NOT FOUND: Contract not found in this collection');
    }

    const orgRole = await this.permissionService.resolveOrgRole(reqUser.id, organizationId);
    const batchCtx = await this.permissionService.buildBatchContext(
      reqUser.id,
      organizationId,
      orgRole,
      reqUser.role === 'ADMIN'
    );
    const entityPerms = batchCtx.entityPermissions.get(`contract:${contract.slug}`);

    const result = this.permissionEngine.evaluate({
      userId: reqUser.id,
      organizationId,
      entityType: 'contract',
      entitySlug: contract.slug,
      action: 'PUT',
      isPrivate: contract.private,
      userOrgRole: orgRole,
      isGlobalAdmin: reqUser.role === 'ADMIN',
      entityPermissions: entityPerms,
    });
    if (!result.allowed) {
      throw new Error(`PERMISSION ERROR: ${result.reason}`);
    }

    return contract;
  }
}

export default AnalysisSaveService;
