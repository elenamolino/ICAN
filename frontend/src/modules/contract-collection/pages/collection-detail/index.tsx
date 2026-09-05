import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import Skeleton from 'react-loading-skeleton';
import Iconify from '../../../core/components/iconify';
import { useRouter } from '../../../core/hooks/useRouter';
import { staggerContainer, fadeInUp, transitionDefault } from '../../../core/utils/motion-variants';
import customConfirm from '../../../core/utils/custom-confirm';
import customAlert from '../../../core/utils/custom-alert';
import {
  Contract,
  ContractCollectionSummary,
  useContractCollectionsApi,
} from '../../api/contractCollectionsApi';
import ContractCard from '../../components/contract-card';

const PER_PAGE = 12;
const OTHER_GROUP_LABEL = 'Other';

function groupByService(contracts: Contract[]): { label: string; contracts: Contract[] }[] {
  const bySlug = new Map<string, { label: string; contracts: Contract[] }>();
  const other: Contract[] = [];

  for (const contract of contracts) {
    if (!contract.service) {
      other.push(contract);
      continue;
    }
    const key = contract.service.slug;
    if (!bySlug.has(key)) {
      bySlug.set(key, { label: contract.service.name, contracts: [] });
    }
    bySlug.get(key)!.contracts.push(contract);
  }

  const groups = [...bySlug.values()].sort((a, b) => a.label.localeCompare(b.label));
  if (other.length > 0) groups.push({ label: OTHER_GROUP_LABEL, contracts: other });
  return groups;
}

export default function CollectionDetailPage() {
  const { organizationId, collectionSlug } = useParams<{ organizationId: string; collectionSlug: string }>();
  const router = useRouter();
  const { getCollection, updateCollection, deleteCollection } = useContractCollectionsApi();
  const [collection, setCollection] = useState<ContractCollectionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  useEffect(() => {
    if (!organizationId || !collectionSlug) return;
    setIsLoading(true);
    setError(null);
    getCollection(organizationId, collectionSlug)
      .then(setCollection)
      .catch(() => setError('Collection not found'))
      .finally(() => setIsLoading(false));
  }, [organizationId, collectionSlug]);

  const contracts: Contract[] = collection?.contracts ?? [];

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

  const handleToggleVisibility = async () => {
    if (!organizationId || !collectionSlug || !collection) return;
    const nextPrivate = !collection.private;
    setTogglingVisibility(true);
    try {
      const updated = await updateCollection(organizationId, collectionSlug, { private: nextPrivate });
      // The update endpoint answers with the collection alone — keep the contracts
      // and the permission flag already loaded so the list does not blank out.
      setCollection((prev) =>
        prev
          ? { ...prev, ...updated, contracts: updated.contracts ?? prev.contracts, canEdit: updated.canEdit ?? prev.canEdit }
          : updated
      );
    } catch (err: any) {
      await customAlert(err.message || 'Failed to update collection visibility', 'error');
    } finally {
      setTogglingVisibility(false);
    }
  };

  const groups = groupByService(contracts);

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
          <div className="mb-4 text-sm font-medium text-tp-ink">
            {isLoading ? 'Loading...' : `${contracts.length} ${contracts.length === 1 ? 'contract' : 'contracts'} in collection`}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: PER_PAGE }).map((_, i) => (
                <Skeleton key={i} height={96} />
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-tp-hairline bg-tp-canvas py-16 text-center">
              <p className="text-sm font-medium text-tp-ink">No contracts in this collection</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map((group) => (
                <div key={group.label}>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-tp-steel">
                    {group.label}
                  </h2>
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {group.contracts.map((contract) => (
                      <motion.div key={contract.id ?? contract.slug} variants={fadeInUp} transition={transitionDefault}>
                        <ContractCard data={{ ...contract, organization: contract.organization ?? collection?.organization, collection: { id: collection!.id, name: collection!.name, slug: collection!.slug } }} />
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
