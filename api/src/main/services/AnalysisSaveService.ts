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

function contentHash(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

export interface SaveAnalysisPayload {
  collectionId: string;
  serviceId?: string;
  serviceName?: string;
  contractId?: string;
  contractName?: string;
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
  private permissionService: PermissionService;
  private permissionEngine: PermissionEngine;

  constructor() {
    this.contractCollectionRepository = container.resolve('contractCollectionRepository');
    this.contractRepository = container.resolve('contractRepository');
    this.serviceRepository = container.resolve('serviceRepository');
    this.serviceService = container.resolve('serviceService');
    this.contractService = container.resolve('contractService');
    this.contractVersionService = container.resolve('contractVersionService');
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
            name: `${payload.provider} — ${payload.title}`,
            content: payload.text,
            serviceId,
          },
          organizationId,
          false,
          reqUser,
          payload.collectionId
        );
    const contractId = contract.id ?? contract._id?.toString();

    const commitHash = contentHash(payload.text);
    await this.contractVersionService.upsertVersion(contractId, {
      commitHash,
      capturedAt: new Date(payload.date),
      label: 'last',
      content: payload.text,
      precomputedAnalysis: { summary: payload.summary, clauses: payload.clauses },
    });

    await this.contractVersionService.relabelAllByDate(contractId);

    const versions: any[] = await this.contractVersionService.listByContract(contractId);
    const lastVersion = versions.find(v => v.label === 'last') ?? versions[versions.length - 1];

    if (lastVersion) {
      await this.contractRepository.update(contractId, {
        content: payload.text,
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
