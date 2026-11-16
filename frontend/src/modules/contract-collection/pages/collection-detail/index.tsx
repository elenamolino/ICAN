import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import Skeleton from 'react-loading-skeleton';
import Iconify from '../../../core/components/iconify';
import SearchInput from '../../../core/components/search-input';
import FilterBar from '../../../core/components/filter-bar';
import { useRouter } from '../../../core/hooks/useRouter';
import { useDebouncedValue } from '../../../core/hooks/useDebouncedValue';
import { transitionDefault } from '../../../core/utils/motion-variants';
import customConfirm from '../../../core/utils/custom-confirm';
import customAlert from '../../../core/utils/custom-alert';
import {
  CaptureAge,
  CollectionServicesPage,
  ContractCollectionSummary,
  DocumentFilter,
  PolicyType,
  ReviewState,
  useContractCollectionsApi,
} from '../../api/contractCollectionsApi';
import CollectionTree from '../../components/collection-tree';
import DocumentList from '../../components/document-list';
import { buildServiceTree, findCategory, firstCategory } from '../../components/collection-tree/model';

// Services are fetched a page at a time: a large collection used to arrive whole,
// with the full text of every document, and took far too long to open.
const PAGE_SIZE = 10;

const policyTypeLabels: Record<PolicyType, string> = {
  'terms-of-service': 'Terms of Service',
  'privacy-policy': 'Privacy Policy',
  'acceptable-use-policy': 'Acceptable Use Policy',
  'service-level-agreement': 'Service Level Agreement',
  'data-security-policy': 'Data, Content & Security',
  'other-policy': 'Other policy types',
};

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
  const { getCollection, listCollectionServices, updateCollection, deleteCollection } = useContractCollectionsApi();
  const [collection, setCollection] = useState<ContractCollectionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Every page fetched so far for the current filters, merged into one.
  const [servicesPage, setServicesPage] = useState<CollectionServicesPage | null>(null);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreController = useRef<AbortController | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Below lg the two panels are separate screens: the tree first, then the list.
  const [mobileView, setMobileView] = useState<'tree' | 'list'>('tree');
  const [textFilter, setTextFilter] = useState('');
  const debouncedTextFilter = useDebouncedValue(textFilter.trim(), 300);
  const [serviceFilters, setServiceFilters] = useState<DocumentFilter[]>([]);
  const [policyTypeFilters, setPolicyTypeFilters] = useState<PolicyType[]>([]);
  const [reviewFilters, setReviewFilters] = useState<ReviewState[]>([]);
  const [captureAgeFilters, setCaptureAgeFilters] = useState<CaptureAge[]>([]);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  const servicesQuery = useMemo(() => ({
    name: debouncedTextFilter || undefined,
    documents: serviceFilters,
    policyTypes: policyTypeFilters,
    review: reviewFilters,
    captured: captureAgeFilters,
  }), [captureAgeFilters, debouncedTextFilter, policyTypeFilters, reviewFilters, serviceFilters]);

  useEffect(() => {
    if (!organizationId || !collectionSlug) return;
    setIsLoading(true);
    setError(null);
    let isCurrent = true;

    async function loadCollection() {
      try {
        const retrievedCollection = await getCollection(organizationId!, collectionSlug!);
        if (isCurrent) setCollection(retrievedCollection);
      } catch {
        if (isCurrent) setError('Collection not found');
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    loadCollection();
    return () => { isCurrent = false; };
  }, [organizationId, collectionSlug]);

  // Changing the search or a filter starts again from the first page.
  useEffect(() => {
    if (!organizationId || !collectionSlug) return;
    loadMoreController.current?.abort();
    const controller = new AbortController();
    setIsLoadingServices(true);

    listCollectionServices(organizationId, collectionSlug, { ...servicesQuery, limit: PAGE_SIZE, offset: 0 }, controller.signal)
      .then(setServicesPage)
      .catch(() => {
        if (!controller.signal.aborted) setServicesPage(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingServices(false);
      });

    return () => controller.abort();
  }, [organizationId, collectionSlug, servicesQuery]);

  const loadMoreServices = async () => {
    if (!organizationId || !collectionSlug || !servicesPage || isLoadingMore) return;
    const controller = new AbortController();
    loadMoreController.current = controller;
    setIsLoadingMore(true);
    try {
      const nextPage = await listCollectionServices(
        organizationId,
        collectionSlug,
        { ...servicesQuery, limit: PAGE_SIZE, offset: servicesPage.services.length },
        controller.signal
      );
      setServicesPage((prev) => prev && { ...nextPage, services: [...prev.services, ...nextPage.services] });
    } catch {
      if (!controller.signal.aborted) await customAlert('Failed to load more services', 'error');
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false);
    }
  };

  const loadedServices = useMemo(() => servicesPage?.services ?? [], [servicesPage]);
  const totalServices = servicesPage?.total ?? 0;
  const remainingServices = totalServices - loadedServices.length;
  const contractCount = collection?.contractCount ?? 0;

  const filteredTree = useMemo(
    () => buildServiceTree(loadedServices.map(({ contracts, ...service }) => ({ service, contracts }))),
    [loadedServices]
  );
  // Keep the chosen category while it survives the filters; otherwise fall back to the first visible one.
  const selection = useMemo(
    () => findCategory(filteredTree, selectedKey) ?? firstCategory(filteredTree),
    [filteredTree, selectedKey]
  );
  const selectCategory = (key: string) => {
    setSelectedKey(key);
    setMobileView('list');
  };
  const facets = servicesPage?.facets;
  const filterOptions = useMemo(() => [
    { label: 'With documents', value: 'with-documents', count: facets?.documents['with-documents'] ?? 0 },
    { label: 'Empty services', value: 'empty', count: facets?.documents.empty ?? 0 },
  ], [facets]);
  const policyTypeOptions = useMemo(() => (Object.keys(policyTypeLabels) as PolicyType[]).map((type) => ({
    label: policyTypeLabels[type],
    value: type,
    count: facets?.policyTypes[type] ?? 0,
  })).filter((option) => option.count > 0), [facets]);
  const reviewOptions = useMemo(() => [
    { label: 'Has unfair clauses', value: 'has-unfair-clauses', count: facets?.review['has-unfair-clauses'] ?? 0 },
    { label: 'No unfair clauses', value: 'no-unfair-clauses', count: facets?.review['no-unfair-clauses'] ?? 0 },
    { label: 'Not analysed', value: 'not-analysed', count: facets?.review['not-analysed'] ?? 0 },
  ].filter((option) => option.count > 0), [facets]);
  const captureAgeOptions = useMemo(() => [
    { label: 'Captured in the last 30 days', value: 'last-30-days', count: facets?.captured['last-30-days'] ?? 0 },
    { label: 'Captured over 90 days ago', value: 'older-than-90-days', count: facets?.captured['older-than-90-days'] ?? 0 },
  ].filter((option) => option.count > 0), [facets]);
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
        contractCount > 0
          ? `Delete this collection? This will also delete its ${contractCount} ${contractCount === 1 ? 'contract' : 'contracts'} and all their saved versions. This cannot be undone.`
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

  const handleToggleVisibility = async () => {
    if (!organizationId || !collectionSlug || !collection) return;
    const nextPrivate = !collection.private;
    setTogglingVisibility(true);
    try {
      const updated = await updateCollection(organizationId, collectionSlug, { private: nextPrivate });
      // The update endpoint answers with the collection alone, so keep the count
      // and the permission flags already loaded.
      setCollection((prev) =>
        prev
          ? {
              ...prev,
              ...updated,
              contractCount: prev.contractCount,
              canEdit: updated.canEdit ?? prev.canEdit,
              canDelete: updated.canDelete ?? prev.canDelete,
            }
          : updated
      );
    } catch (err: any) {
      await customAlert(err.message || 'Failed to update collection visibility', 'error');
    } finally {
      setTogglingVisibility(false);
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
          {collection && (collection.canEdit || collection.canDelete) && (
            <div className="flex shrink-0 items-center gap-2">
              {collection.canEdit && (
                <button
                  type="button"
                  onClick={handleToggleVisibility}
                  disabled={togglingVisibility}
                  title={
                    collection.private
                      ? 'Only members of the organization can see this collection — click to make it public'
                      : 'Anyone can see this collection — click to make it private'
                  }
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel transition-colors hover:border-tp-primary hover:text-tp-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Iconify icon={collection.private ? 'mdi:lock-outline' : 'mdi:earth'} width={14} />
                  {togglingVisibility ? 'Updating…' : collection.private ? 'Private' : 'Public'}
                </button>
              )}
              {collection.canDelete && (
                <button
                  type="button"
                  onClick={handleDeleteCollection}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel transition-colors hover:border-tp-severity-error hover:text-tp-severity-error"
                >
                  <Iconify icon="mdi:trash-can-outline" width={14} />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {error ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-tp-hairline bg-tp-canvas py-16 text-center">
          <p className="text-sm font-medium text-tp-ink">{error}</p>
        </div>
      ) : (
        <>
          {isLoading || (isLoadingServices && !servicesPage) ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={64} />
              ))}
            </div>
          ) : totalServices === 0 && !hasActiveFilters && !debouncedTextFilter && contractCount === 0 ? (
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
                    onChange={(filters) => { setServiceFilters(filters as DocumentFilter[]) }}
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

              <p className="mb-3 text-xs text-tp-steel" aria-live="polite">
                {isLoadingServices
                  ? 'Loading services…'
                  : `${loadedServices.length} of ${totalServices} ${totalServices === 1 ? 'service' : 'services'} shown`}
              </p>

              <div className={`grid items-start gap-4 transition-opacity lg:grid-cols-[1fr_2fr] ${isLoadingServices ? 'opacity-60' : ''}`}>
                <aside
                  aria-label="Collection navigation"
                  className={`${mobileView === 'list' ? 'hidden' : 'block'} min-h-0 overflow-y-auto rounded-xl border border-tp-hairline bg-tp-canvas p-2 lg:block lg:max-h-[min(30rem,calc(100vh-14rem))]`}
                >
                  {filteredTree.length === 0 ? (
                    <NoResults />
                  ) : (
                    <CollectionTree tree={filteredTree} selection={selection} onSelect={selectCategory} />
                  )}
                  {remainingServices > 0 && (
                    <button
                      type="button"
                      onClick={loadMoreServices}
                      disabled={isLoadingMore || isLoadingServices}
                      className="mt-2 w-full cursor-pointer rounded-lg border border-tp-hairline px-3 py-2 text-xs font-medium text-tp-steel transition-colors hover:border-tp-primary hover:text-tp-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLoadingMore
                        ? 'Loading…'
                        : `Load ${Math.min(PAGE_SIZE, remainingServices)} more of ${remainingServices} remaining`}
                    </button>
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
