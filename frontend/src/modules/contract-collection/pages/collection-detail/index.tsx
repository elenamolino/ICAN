import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import Skeleton from 'react-loading-skeleton';
import Iconify from '../../../core/components/iconify';
import SearchInput from '../../../core/components/search-input';
import FilterBar from '../../../core/components/filter-bar';
import { useRouter } from '../../../core/hooks/useRouter';
import { useAuth } from '../../../auth/hooks/useAuth';
import { transitionDefault } from '../../../core/utils/motion-variants';
import customConfirm from '../../../core/utils/custom-confirm';
import customAlert from '../../../core/utils/custom-alert';
import {
  Contract,
  ContractCollectionSummary,
  getCollection,
  useContractCollectionsApi,
} from '../../api/contractCollectionsApi';
import { listServices, ServiceSummary } from '../../api/servicesApi';
import CollectionTree from '../../components/collection-tree';
import DocumentList from '../../components/document-list';
import { buildServiceTree, findCategory, firstCategory } from '../../components/collection-tree/model';

const UNASSIGNED_SERVICE: ServiceSummary = { id: '__unassigned__', name: 'Unassigned documents', slug: '__unassigned__' };

type PolicyType = 'terms-of-service' | 'privacy-policy' | 'acceptable-use-policy' | 'service-level-agreement' | 'data-security-policy' | 'other-policy';
type ReviewState = 'has-unfair-clauses' | 'no-unfair-clauses' | 'not-analysed';
type CaptureAge = 'last-30-days' | 'older-than-90-days';

const policyTypeLabels: Record<PolicyType, string> = {
  'terms-of-service': 'Terms of Service',
  'privacy-policy': 'Privacy Policy',
  'acceptable-use-policy': 'Acceptable Use Policy',
  'service-level-agreement': 'Service Level Agreement',
  'data-security-policy': 'Data, Content & Security',
  'other-policy': 'Other policy types',
};

function policyTypeForContract(contract: Contract): PolicyType {
  const name = contract.name.toLocaleLowerCase();
  if (name.includes('service level') || name.includes(' sla')) return 'service-level-agreement';
  if (name.includes('privacy')) return 'privacy-policy';
  if (name.includes('acceptable use')) return 'acceptable-use-policy';
  if (name.includes('terms of service') || name.includes('terms and conditions') || name.includes('general terms')) return 'terms-of-service';
  if (/(data|content|security|tracker|cookie)/.test(name)) return 'data-security-policy';
  return 'other-policy';
}

function matchesReviewState(contract: Contract, states: ReviewState[]): boolean {
  if (states.length === 0) return true;
  const summary = contract.latestVersionSummary;
  return states.some((state) => (
    (state === 'has-unfair-clauses' && (summary?.unfairClauses ?? 0) > 0)
    || (state === 'no-unfair-clauses' && summary !== undefined && summary.unfairClauses === 0)
    || (state === 'not-analysed' && summary === undefined)
  ));
}

function matchesCaptureAge(contract: Contract, ages: CaptureAge[], now: number): boolean {
  if (ages.length === 0) return true;
  const capturedAt = new Date(contract.createdAt).getTime();
  if (Number.isNaN(capturedAt)) return false;
  const ageInDays = (now - capturedAt) / 86_400_000;
  return ages.some((age) => (
    (age === 'last-30-days' && ageInDays <= 30)
    || (age === 'older-than-90-days' && ageInDays > 90)
  ));
}

function NoResults({ documents = false }: { documents?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-sm font-medium text-tp-ink">
        {documents ? 'No documents to show' : 'No services match your search'}
      </p>
      <p className="mt-1 text-xs text-tp-steel">Try another service name or change the filters.</p>
    </div>
  );
}

export default function CollectionDetailPage() {
  const { organizationId, collectionSlug } = useParams<{ organizationId: string; collectionSlug: string }>();
  const router = useRouter();
  const { authUser } = useAuth();
  const { deleteCollection } = useContractCollectionsApi();
  const [collection, setCollection] = useState<ContractCollectionSummary | null>(null);
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Below lg the two panels are separate screens: the tree first, then the list.
  const [mobileView, setMobileView] = useState<'tree' | 'list'>('tree');
  const [textFilter, setTextFilter] = useState('');
  const [serviceFilters, setServiceFilters] = useState<string[]>([]);
  const [policyTypeFilters, setPolicyTypeFilters] = useState<PolicyType[]>([]);
  const [reviewFilters, setReviewFilters] = useState<ReviewState[]>([]);
  const [captureAgeFilters, setCaptureAgeFilters] = useState<CaptureAge[]>([]);

  useEffect(() => {
    if (!organizationId || !collectionSlug) return;
    setIsLoading(true);
    setError(null);
    let isCurrent = true;

    async function loadCollection() {
      try {
        const retrievedCollection = await getCollection(organizationId!, collectionSlug!);
        const retrievedServices = await listServices({ collectionId: retrievedCollection.id });
        if (!isCurrent) return;
        setCollection(retrievedCollection);
        setServices(retrievedServices);
      } catch {
        if (isCurrent) setError('Collection not found');
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    loadCollection();
    return () => { isCurrent = false; };
  }, [organizationId, collectionSlug]);

  const contracts: Contract[] = collection?.contracts ?? [];

  const serviceNodes = useMemo(() => {
    const contractsByServiceSlug = new Map<string, Contract[]>();
    const unassignedContracts: Contract[] = [];

    contracts.forEach((contract) => {
      if (!contract.service) {
        unassignedContracts.push(contract);
        return;
      }
      const serviceContracts = contractsByServiceSlug.get(contract.service.slug) ?? [];
      serviceContracts.push(contract);
      contractsByServiceSlug.set(contract.service.slug, serviceContracts);
    });

    const nodes = services.map((service) => ({ service, contracts: contractsByServiceSlug.get(service.slug) ?? [] }));
    if (unassignedContracts.length > 0) nodes.push({ service: UNASSIGNED_SERVICE, contracts: unassignedContracts });
    return nodes;
  }, [contracts, services]);

  const filteredServiceNodes = useMemo(() => {
    const normalizedFilter = textFilter.trim().toLocaleLowerCase();
    const now = Date.now();
    return serviceNodes.flatMap(({ service, contracts: serviceContracts }) => {
      const visibleContracts = serviceContracts.filter((contract) => (
        (policyTypeFilters.length === 0 || policyTypeFilters.includes(policyTypeForContract(contract)))
        && matchesReviewState(contract, reviewFilters)
        && matchesCaptureAge(contract, captureAgeFilters, now)
      ));
      const matchesText = !normalizedFilter || service.name.toLocaleLowerCase().includes(normalizedFilter);
      const matchesDocumentFilter = serviceFilters.length === 0
        || (serviceFilters.includes('with-documents') && serviceContracts.length > 0)
        || (serviceFilters.includes('empty') && serviceContracts.length === 0);
      const hasDocumentLevelFilter = policyTypeFilters.length > 0 || reviewFilters.length > 0 || captureAgeFilters.length > 0;
      const matchesDocumentCriteria = !hasDocumentLevelFilter || visibleContracts.length > 0;
      return matchesText && matchesDocumentFilter && matchesDocumentCriteria
        ? [{ service, contracts: visibleContracts }]
        : [];
    });
  }, [captureAgeFilters, policyTypeFilters, reviewFilters, serviceFilters, serviceNodes, textFilter]);

  const filteredTree = useMemo(() => buildServiceTree(filteredServiceNodes), [filteredServiceNodes]);
  // Keep the chosen category while it survives the filters; otherwise fall back to the first visible one.
  const selection = useMemo(
    () => findCategory(filteredTree, selectedKey) ?? firstCategory(filteredTree),
    [filteredTree, selectedKey]
  );
  const selectCategory = (key: string) => {
    setSelectedKey(key);
    setMobileView('list');
  };
  const filterOptions = useMemo(() => [
    { label: 'With documents', value: 'with-documents', count: serviceNodes.filter(({ contracts: items }) => items.length > 0).length },
    { label: 'Empty services', value: 'empty', count: serviceNodes.filter(({ contracts: items }) => items.length === 0).length },
  ], [serviceNodes]);
  const policyTypeOptions = useMemo(() => (Object.keys(policyTypeLabels) as PolicyType[]).map((type) => ({
    label: policyTypeLabels[type],
    value: type,
    count: serviceNodes.filter(({ contracts: items }) => items.some((contract) => policyTypeForContract(contract) === type)).length,
  })).filter((option) => option.count > 0), [serviceNodes]);
  const reviewOptions = useMemo(() => [
    { label: 'Has unfair clauses', value: 'has-unfair-clauses', count: serviceNodes.filter(({ contracts: items }) => items.some((contract) => (contract.latestVersionSummary?.unfairClauses ?? 0) > 0)).length },
    { label: 'No unfair clauses', value: 'no-unfair-clauses', count: serviceNodes.filter(({ contracts: items }) => items.some((contract) => contract.latestVersionSummary !== undefined && contract.latestVersionSummary.unfairClauses === 0)).length },
    { label: 'Not analysed', value: 'not-analysed', count: serviceNodes.filter(({ contracts: items }) => items.some((contract) => contract.latestVersionSummary === undefined)).length },
  ].filter((option) => option.count > 0), [serviceNodes]);
  const captureAgeOptions = useMemo(() => {
    const now = Date.now();
    return [
      { label: 'Captured in the last 30 days', value: 'last-30-days', count: serviceNodes.filter(({ contracts: items }) => items.some((contract) => matchesCaptureAge(contract, ['last-30-days'], now))).length },
      { label: 'Captured over 90 days ago', value: 'older-than-90-days', count: serviceNodes.filter(({ contracts: items }) => items.some((contract) => matchesCaptureAge(contract, ['older-than-90-days'], now))).length },
    ].filter((option) => option.count > 0);
  }, [serviceNodes]);
  const hasActiveFilters = serviceFilters.length > 0
    || policyTypeFilters.length > 0
    || reviewFilters.length > 0
    || captureAgeFilters.length > 0;
  const clearAllFilters = () => {
    setServiceFilters([]);
    setPolicyTypeFilters([]);
    setReviewFilters([]);
    setCaptureAgeFilters([]);
  };

  const handleDeleteCollection = async () => {
    if (!organizationId || !collectionSlug) return;
    try {
      await customConfirm(
        contracts.length > 0
          ? `Delete this collection? This will also delete its ${contracts.length} ${contracts.length === 1 ? 'contract' : 'contracts'} and all their saved versions. This cannot be undone.`
          : 'Delete this collection? This cannot be undone.',
        { danger: true, confirmLabel: 'Delete' }
      );
    } catch {
      return;
    }
    try {
      await deleteCollection(organizationId, collectionSlug, true);
      router.push('/collections');
    } catch (err: any) {
      await customAlert(err.message || 'Failed to delete collection', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <Helmet>
        <title>{collection?.name || collectionSlug} | ICAN</title>
      </Helmet>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={transitionDefault} className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-tp-steel">
          <button type="button" onClick={() => router.push('/collections')} className="cursor-pointer hover:text-tp-ink">
            Collections
          </button>
          <span>/</span>
          <span className="text-tp-ink">{collection?.name || collectionSlug}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-normal text-tp-ink">{collection?.name || collectionSlug}</h1>
            <p className="mt-1 text-sm text-tp-steel">
              {collection?.organization.displayName || collection?.organization.name}
              {collection?.description && <span className="ml-1">· {collection.description}</span>}
            </p>
          </div>
          {authUser.isAuthenticated && collection && (
            <button
              type="button"
              onClick={handleDeleteCollection}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel transition-colors hover:border-tp-severity-error hover:text-tp-severity-error"
            >
              <Iconify icon="mdi:trash-can-outline" width={14} />
              Delete
            </button>
          )}
        </div>
      </motion.div>

      {error ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-tp-hairline bg-tp-canvas py-16 text-center">
          <p className="text-sm font-medium text-tp-ink">{error}</p>
        </div>
      ) : (
        <>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={64} />
              ))}
            </div>
          ) : services.length === 0 && contracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-tp-hairline bg-tp-canvas py-16 text-center">
              <p className="text-sm font-medium text-tp-ink">No services in this collection</p>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="w-full sm:max-w-[24rem]">
                  <SearchInput placeholder="Search services..." onSearch={setTextFilter} live />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterBar
                    label="Policy type"
                    options={policyTypeOptions}
                    selected={policyTypeFilters}
                    onChange={(filters) => { setPolicyTypeFilters(filters as PolicyType[]) }}
                    onClear={() => { setPolicyTypeFilters([]) }}
                    showClear={false}
                    openOnHover
                  />
                  <FilterBar
                    label="Review"
                    options={reviewOptions}
                    selected={reviewFilters}
                    onChange={(filters) => { setReviewFilters(filters as ReviewState[]) }}
                    onClear={() => { setReviewFilters([]) }}
                    showClear={false}
                    openOnHover
                  />
                  <FilterBar
                    label="Captured"
                    options={captureAgeOptions}
                    selected={captureAgeFilters}
                    onChange={(filters) => { setCaptureAgeFilters(filters as CaptureAge[]) }}
                    onClear={() => { setCaptureAgeFilters([]) }}
                    showClear={false}
                    openOnHover
                  />
                  <FilterBar
                    label="Documents"
                    options={filterOptions}
                    selected={serviceFilters}
                    onChange={(filters) => { setServiceFilters(filters) }}
                    onClear={() => { setServiceFilters([]) }}
                    showClear={false}
                    openOnHover
                  />
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-tp-muted transition-colors hover:bg-tp-surface hover:text-tp-severity-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tp-primary"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear all filters
                    </button>
                  )}
                </div>
              </div>

              <p className="mb-3 text-xs text-tp-steel">
                {filteredTree.length} {filteredTree.length === 1 ? 'service' : 'services'} shown
              </p>

              <div className="grid items-start gap-4 lg:grid-cols-[1fr_2fr]">
                <aside
                  aria-label="Collection navigation"
                  className={`${mobileView === 'list' ? 'hidden' : 'block'} min-h-0 overflow-y-auto rounded-xl border border-tp-hairline bg-tp-canvas p-2 lg:block lg:max-h-[min(30rem,calc(100vh-14rem))]`}
                >
                  {filteredTree.length === 0 ? (
                    <NoResults />
                  ) : (
                    <CollectionTree tree={filteredTree} selection={selection} onSelect={selectCategory} />
                  )}
                </aside>

                {/* Fits its content and stays in view while the tree scrolls. */}
                <section
                  aria-label="Documents"
                  className={`${mobileView === 'tree' ? 'hidden' : 'block'} rounded-xl border border-tp-hairline bg-tp-canvas p-4 lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto`}
                >
                  {selection && collection ? (
                    <DocumentList selection={selection} collection={collection} onBack={() => setMobileView('tree')} />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setMobileView('tree')}
                        className="mb-3 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-tp-steel hover:text-tp-ink lg:hidden"
                      >
                        ← Back
                      </button>
                      <NoResults documents />
                    </>
                  )}
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
