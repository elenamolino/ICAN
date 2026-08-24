import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import DOMPurify from 'dompurify';
import Iconify from '../../../core/components/iconify';
import { useRouter } from '../../../core/hooks/useRouter';
import { fadeInUp, transitionDefault } from '../../../core/utils/motion-variants';
import {
  Contract,
  ContractVersionDetail,
  ContractVersionListItem,
  getContract,
  getContractVersion,
  listContractVersions,
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
  const [contract, setContract] = useState<Contract | null>(null);
  const [versions, setVersions] = useState<ContractVersionListItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ContractVersionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingVersion, setIsLoadingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('content');

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

  const sanitizedContent = useMemo(() => {
    const html = selectedVersion?.content ?? contract?.content;
    return html ? DOMPurify.sanitize(html) : '';
  }, [selectedVersion?.content, contract?.content]);

  const backHref = collectionSlug
    ? `/collections/${organizationId}/${collectionSlug}`
    : contract?.collection
      ? `/collections/${organizationId}/${contract.collection.slug}`
      : '/contracts';
  const backLabel = collectionSlug || contract?.collection ? 'Back to collection' : 'Back to contracts';

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
          {contract.url && (
            <a
              href={contract.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel transition-colors hover:border-tp-hairline-strong hover:text-tp-ink"
            >
              Source
              <Iconify icon="mdi:open-in-new" width={14} />
            </a>
          )}
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
              {sanitizedContent ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
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
