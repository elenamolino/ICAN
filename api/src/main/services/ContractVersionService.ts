import container from '../config/container';
import ContractVersionRepository from '../repositories/mongoose/ContractVersionRepository';
import AnalysisService from './AnalysisService';
import ContractService from './ContractService';
import { LeanUser } from '../types/models/User';
import { ContractVersionLabel } from '../types/models/ContractVersion';

// Below this many characters of visible text, the readability extraction is
// treated as having failed (typical of JS-rendered pages or empty historical
// snapshots) — the version is still stored, but without an AI analysis.
const MIN_VISIBLE_TEXT_LENGTH = 50;

function extractVisibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface UpsertVersionInput {
  commitHash: string;
  capturedAt: Date;
  label: ContractVersionLabel;
  content: string;
  insertions?: number | null;
  deletions?: number | null;
}

class ContractVersionService {
  private contractVersionRepository: ContractVersionRepository;
  private analysisService: AnalysisService;
  private contractService: ContractService;

  constructor() {
    this.contractVersionRepository = container.resolve('contractVersionRepository');
    this.analysisService = container.resolve('analysisService');
    this.contractService = container.resolve('contractService');
  }

  async resolveContractOrThrow(organizationId: string, contractSlug: string, reqUser?: LeanUser) {
    return this.contractService.show(contractSlug, organizationId, reqUser);
  }

  async upsertVersion(
    contractId: string,
    input: UpsertVersionInput
  ): Promise<{ version: any; reused: boolean }> {
    const existing = await this.contractVersionRepository.findByContractAndCommit(
      contractId,
      input.commitHash
    );
    if (existing) {
      // The commit's content never changes, but which slot it plays
      // (first/intermediate/last) can shift between syncs as new commits
      // land or the selection logic improves — keep the label current.
      if (existing.label !== input.label) {
        const relabeled = await this.contractVersionRepository.updateLabel(String(existing._id), input.label);
        return { version: relabeled ?? existing, reused: true };
      }
      return { version: existing, reused: true };
    }

    const visibleText = extractVisibleText(input.content);
    const analysisSkipped = visibleText.length < MIN_VISIBLE_TEXT_LENGTH;

    let summary = null;
    let clauses = null;
    if (!analysisSkipped) {
      try {
        const result = await this.analysisService.classify(visibleText);
        summary = result.summary;
        clauses = result.clauses;
      } catch (err) {
        console.warn(
          `ContractVersionService: analysis failed for contract ${contractId} commit ${input.commitHash}:`,
          (err as Error).message
        );
      }
    }

    try {
      const version = await this.contractVersionRepository.create({
        _contractId: contractId,
        commitHash: input.commitHash,
        capturedAt: input.capturedAt,
        label: input.label,
        content: input.content,
        insertions: input.insertions ?? null,
        deletions: input.deletions ?? null,
        summary,
        clauses,
        analysisSkipped: analysisSkipped || summary === null,
      });
      return { version, reused: false };
    } catch (err) {
      // The findByContractAndCommit check above isn't atomic with this
      // create -- two callers racing on the same (contractId, commitHash)
      // (e.g. a re-run sync overlapping the previous one) can both pass the
      // check and collide on the unique index. Rather than let the whole
      // batch crash, treat that race the same as finding it already there.
      if ((err as any)?.code === 11000) {
        const raced = await this.contractVersionRepository.findByContractAndCommit(
          contractId,
          input.commitHash
        );
        if (raced) return { version: raced, reused: true };
      }
      throw err;
    }
  }

  async pruneToSelection(contractId: string, keepCommitHashes: string[]) {
    return this.contractVersionRepository.deleteManyNotIn(contractId, keepCommitHashes);
  }

  async listByContract(contractId: string) {
    return this.contractVersionRepository.findByContractId(contractId);
  }

  async getById(contractId: string, versionId: string) {
    const version = await this.contractVersionRepository.findById(versionId);
    if (!version || String((version as any)._contractId) !== String(contractId)) {
      throw new Error('NOT FOUND: Contract version not found');
    }
    return version;
  }
}

export default ContractVersionService;
