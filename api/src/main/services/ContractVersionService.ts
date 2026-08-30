import container from '../config/container';
import ContractVersionRepository from '../repositories/mongoose/ContractVersionRepository';
import AnalysisService from './AnalysisService';
import ContractService from './ContractService';
import { LeanUser } from '../types/models/User';
import { ContractVersionLabel } from '../types/models/ContractVersion';
import { labelForIndex } from '../utils/contractVersionLabels';
import { AnalysisSummary, ClauseAnalysis } from '../types/services/AnalysisService';

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
  // When provided, skips the analyzer call and stores this analysis as-is —
  // used when the caller already ran AI Classify on this exact content (ad-hoc
  // saves) and re-analyzing would just be a duplicate, billable call.
  precomputedAnalysis?: { summary: AnalysisSummary; clauses: ClauseAnalysis[] } | null;
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

    let summary = null;
    let clauses = null;
    let analysisSkipped = false;

    if (input.precomputedAnalysis) {
      summary = input.precomputedAnalysis.summary;
      clauses = input.precomputedAnalysis.clauses;
    } else {
      const visibleText = extractVisibleText(input.content);
      analysisSkipped = visibleText.length < MIN_VISIBLE_TEXT_LENGTH;

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
    }

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
  }

  async pruneToSelection(contractId: string, keepCommitHashes: string[]) {
    return this.contractVersionRepository.deleteManyNotIn(contractId, keepCommitHashes);
  }

  async listByContract(contractId: string) {
    return this.contractVersionRepository.findByContractId(contractId);
  }

  // Re-derives first/intermediate/last across *all* of a contract's versions,
  // sorted by capturedAt (not insertion order) — a version saved out of order
  // (e.g. backfilling an older snapshot after a newer one already exists)
  // must still land in the right slot.
  async relabelAllByDate(contractId: string): Promise<void> {
    const versions = await this.contractVersionRepository.findByContractId(contractId);
    await Promise.all(
      versions.map((v: any, index: number) => {
        const label = labelForIndex(index, versions.length);
        if (v.label === label) return null;
        return this.contractVersionRepository.updateLabel(String(v._id ?? v.id), label);
      })
    );
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
