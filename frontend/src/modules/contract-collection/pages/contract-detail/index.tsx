import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Iconify from '../../../core/components/iconify';
import { useRouter } from '../../../core/hooks/useRouter';
import { fadeInUp, transitionDefault } from '../../../core/utils/motion-variants';
import customConfirm from '../../../core/utils/custom-confirm';
import customAlert from '../../../core/utils/custom-alert';
import {
  Contract,
  ContractVersionDetail,
  ContractVersionListItem,
  useContractCollectionsApi,
} from '../../api/contractCollectionsApi';
import SummaryStat from '../../../analysis/components/SummaryStat';
import VersionSelector from '../../components/version-selector';
import FilterableClauseList from '../../components/filterable-clause-list';
import VersionEvolutionChart from '../../components/version-evolution-chart';
import VersionComparison from '../../components/version-comparison';

type Tab = 'content' | 'clauses' | 'evolution' | 'compare';

const TAB_LABELS: Record<Tab, string> = {
  content: 'Content',
  clauses: 'Clauses',
  evolution: 'Evolution',
  compare: 'Compare',
};

export default function ContractDetailPage() {
  const { organizationId, collectionSlug, contractSlug } = useParams<{
    organizationId: string;
    collectionSlug: string;
    contractSlug: string;
  }>();
  const router = useRouter();
  const {
    getContract,
    getContractVersion,
    listContractVersions,
    updateContract,
    deleteContract,
    deleteContractVersion,
  } = useContractCollectionsApi();
  const [contract, setContract] = useState<Contract | null>(null);
  const [versions, setVersions] = useState<ContractVersionListItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ContractVersionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('content');
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  useEffect(() => {
    if (!organizationId || !contractSlug) return;
    setIsLoading(true);
    setError(null);
    Promise.all([
      getContract(organizationId, contractSlug),
      listContractVersions(organizationId, contractSlug).catch(() => []),
    ])
      .then(([contractData, versionsData]) => {
        setContract(contractData);
        setVersions(versionsData);
        const latest = versionsData.find((v) => v.label === 'last') ?? versionsData[versionsData.length - 1];
        if (latest) setSelectedVersionId(latest.id);
      })
      .catch(() => setError('Contract not found'))
      .finally(() => setIsLoading(false));
  }, [organizationId, contractSlug]);

  useEffect(() => {
    if (!organizationId || !contractSlug || !selectedVersionId) {
      setSelectedVersion(null);
      return;
    }
    let cancelled = false;
    setIsLoadingVersion(true);
    getContractVersion(organizationId, contractSlug, selectedVersionId)
      .then((v) => !cancelled && setSelectedVersion(v))
      .catch(() => !cancelled && setSelectedVersion(null))
      .finally(() => !cancelled && setIsLoadingVersion(false));
    return () => {
      cancelled = true;
    };
  }, [organizationId, contractSlug, selectedVersionId]);

  // Version-history content comes from termscockpit's OpenTermsArchive sync,
  // which is already-extracted markdown; a manually-uploaded contract (no
  // version history) stores raw HTML instead.
  const sanitizedHtml = useMemo(() => {
    if (selectedVersion || !contract?.content) return '';
    return DOMPurify.sanitize(contract.content);
  }, [selectedVersion, contract?.content]);

  const backHref = collectionSlug
    ? `/collections/${organizationId}/${collectionSlug}`
    : contract?.collection
      ? `/collections/${organizationId}/${contract.collection.slug}`
      : '/contracts';
  const backLabel = collectionSlug || contract?.collection ? 'Back to collection' : 'Back to contracts';

  const handleToggleVisibility = async () => {
    if (!organizationId || !contractSlug || !contract) return;
    setTogglingVisibility(true);
    try {
      const updated = await updateContract(organizationId, contractSlug, { private: !contract.private });
      // The update endpoint answers with the contract alone — keep the permission
      // flags already loaded so the controls do not disappear.
      setContract((prev) =>
        prev
          ? { ...prev, ...updated, canEdit: updated.canEdit ?? prev.canEdit, canDelete: updated.canDelete ?? prev.canDelete }
          : updated
      );
    } catch (err: any) {
      await customAlert(err.message || 'Failed to update contract visibility', 'error');
    } finally {
      setTogglingVisibility(false);
    }
  };

  const handleDeleteContract = async () => {
    if (!organizationId || !contractSlug) return;
    try {
      await customConfirm(
        'Delete this contract? This will also delete all of its saved versions. This cannot be undone.',
        { danger: true, confirmLabel: 'Delete' }
      );
    } catch {
      return;
    }
    try {
      await deleteContract(organizationId, contractSlug);
      router.push(backHref);
    } catch (err: any) {
      await customAlert(err.message || 'Failed to delete contract', 'error');
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!organizationId || !contractSlug) return;
    try {
      await customConfirm('Delete this saved report? This cannot be undone.', {
        danger: true,
        confirmLabel: 'Delete',
      });
    } catch {
      return;
    }
    try {
      await deleteContractVersion(organizationId, contractSlug, versionId);
      const updated = await listContractVersions(organizationId, contractSlug);
      setVersions(updated);
      if (selectedVersionId === versionId) {
        const latest = updated.find((v) => v.label === 'last') ?? updated[updated.length - 1];
        setSelectedVersionId(latest?.id ?? null);
      }
    } catch (err: any) {
      await customAlert(err.message || 'Failed to delete version', 'error');
    }
  };

  const hasVersionHistory = versions.length > 0;
  const availableTabs: Tab[] = hasVersionHistory
    ? versions.length > 1
      ? ['content', 'clauses', 'evolution', 'compare']
      : ['content', 'clauses']
    : ['content'];

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-[1280px] items-center justify-center px-4 py-8">
        <Iconify icon="mdi:loading" width={28} className="animate-spin text-tp-muted" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-[1280px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <Iconify icon="mdi:file-document-outline" width={32} className="text-tp-muted" />
        <p className="text-sm text-tp-steel">{error ?? 'Contract not found'}</p>
        <button type="button" onClick={() => router.push(backHref)} className="text-sm font-medium text-tp-primary hover:underline">
          {backLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8">
      <Helmet>
        <title>{contract.name} | ICAN</title>
      </Helmet>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={transitionDefault} className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-tp-steel">
          <button type="button" onClick={() => router.push('/collections')} className="cursor-pointer hover:text-tp-ink">
            Collections
          </button>
          {collectionSlug && (
            <>
              <span>/</span>
              <button type="button" onClick={() => router.push(backHref)} className="cursor-pointer hover:text-tp-ink">
                {collectionSlug}
              </button>
            </>
          )}
          <span>/</span>
          <span className="text-tp-ink">{contract.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-2xl font-normal text-tp-ink">{contract.name}</h1>
          <div className="flex shrink-0 items-center gap-2">
            {/* A contract inside a collection takes its visibility from that collection,
                so here it is only reported — the control lives on the collection page.
                A contract with no collection has nothing to inherit from, so it gets
                its own toggle. */}
            {contract.collection ? (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel"
                title={
                  contract.private
                    ? 'Private: only members of the organization can see it'
                    : 'Public: anyone can see it'
                }
              >
                <Iconify icon={contract.private ? 'mdi:lock-outline' : 'mdi:earth'} width={14} />
                {contract.private ? 'Private' : 'Public'}
                <span className="text-tp-muted">
                  · from{' '}
                  <button
                    type="button"
                    onClick={() => router.push(`/collections/${organizationId}/${contract.collection!.slug}`)}
                    className="cursor-pointer underline hover:text-tp-ink"
                  >
                    {contract.collection.name}
                  </button>
                </span>
              </span>
            ) : (
              contract.canEdit && (
                <button
                  type="button"
                  onClick={handleToggleVisibility}
                  disabled={togglingVisibility}
                  title={
                    contract.private
                      ? 'Only members of the organization can see this contract — click to make it public'
                      : 'Anyone can see this contract — click to make it private'
                  }
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel transition-colors hover:border-tp-primary hover:text-tp-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Iconify icon={contract.private ? 'mdi:lock-outline' : 'mdi:earth'} width={14} />
                  {togglingVisibility ? 'Updating…' : contract.private ? 'Private' : 'Public'}
                </button>
              )
            )}
            {contract.url && (
              <a
                href={contract.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel transition-colors hover:border-tp-hairline-strong hover:text-tp-ink"
              >
                Source
                <Iconify icon="mdi:open-in-new" width={14} />
              </a>
            )}
            {contract?.canDelete && (
              <button
                type="button"
                onClick={handleDeleteContract}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel transition-colors hover:border-tp-severity-error hover:text-tp-severity-error"
              >
                <Iconify icon="mdi:trash-can-outline" width={14} />
                Delete
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {hasVersionHistory && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
          transition={transitionDefault}
          className="mb-6 space-y-4"
        >
          <VersionSelector
            versions={versions}
            selectedId={selectedVersionId ?? ''}
            onSelect={(id) => {
              setSelectedVersionId(id);
              setTab('content');
            }}
            onDelete={contract?.canDelete ? handleDeleteVersion : undefined}
          />

          {selectedVersion?.summary && (
            <div className="grid grid-cols-3 gap-3">
              <SummaryStat label="Clauses" value={selectedVersion.summary.totalClauses} />
              <SummaryStat label="Potentially unfair" value={selectedVersion.summary.unfairClauses} />
              <SummaryStat label="Words" value={selectedVersion.summary.totalWords} />
            </div>
          )}

          <nav className="flex gap-1 overflow-x-auto border-b border-tp-hairline" role="tablist">
            {availableTabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  tab === t
                    ? 'border-tp-primary text-tp-primary'
                    : 'border-transparent text-tp-steel hover:text-tp-ink'
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
        </motion.div>
      )}

      {isLoadingVersion ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <Iconify icon="mdi:loading" width={24} className="animate-spin text-tp-muted" />
        </div>
      ) : (
        <>
          {tab === 'content' && (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeInUp}
              transition={{ ...transitionDefault, delay: 0.05 }}
              className="rounded-xl border border-tp-hairline bg-tp-canvas p-6 text-sm leading-relaxed text-tp-ink dark:border-tp-hairline dark:bg-tp-surface [&_a]:text-tp-primary [&_a]:underline [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:first:mt-0 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_p]:mb-3 [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc"
            >
              {selectedVersion ? (
                selectedVersion.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedVersion.content}</ReactMarkdown>
                ) : (
                  <p className="text-sm text-tp-steel">No content available for this version.</p>
                )
              ) : sanitizedHtml ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
              ) : (
                <p className="text-sm text-tp-steel">No content available for this contract.</p>
              )}
            </motion.div>
          )}

          {tab === 'clauses' &&
            (selectedVersion?.clauses ? (
              <FilterableClauseList clauses={selectedVersion.clauses} />
            ) : (
              <p className="text-sm text-tp-steel">
                No clause analysis available for this version (the snapshot had no usable text).
              </p>
            ))}

          {tab === 'evolution' && <VersionEvolutionChart versions={versions} />}

          {tab === 'compare' && organizationId && contractSlug && (
            <VersionComparison organizationId={organizationId} contractSlug={contractSlug} versions={versions} />
          )}
        </>
      )}
    </div>
  );
}
