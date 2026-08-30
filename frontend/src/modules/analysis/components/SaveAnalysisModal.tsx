import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MdCheckCircle } from 'react-icons/md';
import BlockAlert from '../../core/components/block-alert';
import { Organization, useOrganizationsApi } from '../../organization/api/organizationsApi';
import { listCollections, listContracts, ContractCollectionSummary } from '../../contract-collection/api/contractCollectionsApi';
import { listServices, ServiceSummary } from '../../contract-collection/api/servicesApi';
import { useAnalysisApi, AnalyzeResponse } from '../api/analysisApi';
import EntityPickerInput, { EntitySelection } from './EntityPickerInput';

interface SaveAnalysisModalProps {
  open: boolean;
  onClose: () => void;
  text: string;
  result: AnalyzeResponse;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// getMyOrganizations returns a tree (subOrganizations nested) — flatten it so
// orgs the user only has access to via a sub-org still show up as choices.
function flattenOrganizations(orgs: Organization[]): Organization[] {
  return orgs.reduce<Organization[]>((acc, org) => {
    acc.push(org);
    if (org.subOrganizations?.length) {
      acc.push(...flattenOrganizations(org.subOrganizations));
    }
    return acc;
  }, []);
}

export default function SaveAnalysisModal({ open, onClose, text, result }: SaveAnalysisModalProps) {
  const { getMyOrganizations } = useOrganizationsApi();
  const { saveAnalysis } = useAnalysisApi();

  const [collections, setCollections] = useState<ContractCollectionSummary[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<ContractCollectionSummary | null>(null);

  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceSelection, setServiceSelection] = useState<EntitySelection | null>(null);

  const [contracts, setContracts] = useState<Array<{ id: string; name: string; serviceId: string | null }>>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [contractSelection, setContractSelection] = useState<EntitySelection | null>(null);

  const [provider, setProvider] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIsoDate());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<{
    organizationId: string;
    contractSlug: string;
    collectionName: string;
  } | null>(null);

  const resetAll = useCallback(() => {
    setSelectedCollection(null);
    setServices([]);
    setServiceSelection(null);
    setContracts([]);
    setContractSelection(null);
    setProvider('');
    setTitle('');
    setDate(todayIsoDate());
    setError(null);
    setLoading(false);
    setSavedResult(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetAll();
      return;
    }

    setLoadingCollections(true);
    (async () => {
      try {
        const orgsData = await getMyOrganizations({ limit: 100 });
        const myOrgs = flattenOrganizations(Array.isArray(orgsData) ? orgsData : orgsData.items || []);
        const orgIds = myOrgs.map((o) => o.id);
        if (orgIds.length === 0) {
          setCollections([]);
          return;
        }
        const { collections: myCollections } = await listCollections({ organizationIds: orgIds, limit: 100 });
        setCollections(myCollections);
      } catch {
        setCollections([]);
      } finally {
        setLoadingCollections(false);
      }
    })();
  }, [open, getMyOrganizations, resetAll]);

  useEffect(() => {
    setServiceSelection(null);
    setContracts([]);
    setContractSelection(null);

    if (!selectedCollection) {
      setServices([]);
      return;
    }

    setLoadingServices(true);
    listServices({ collectionId: selectedCollection.id })
      .then(setServices)
      .catch(() => setServices([]))
      .finally(() => setLoadingServices(false));
  }, [selectedCollection]);

  useEffect(() => {
    setContractSelection(null);

    if (!selectedCollection || !serviceSelection || serviceSelection.mode !== 'existing') {
      setContracts([]);
      return;
    }

    setLoadingContracts(true);
    listContracts({ collection: selectedCollection.slug, limit: 200 })
      .then(({ contracts: fetched }) => {
        setContracts(
          fetched
            .filter((c) => c.service?.id === serviceSelection.id)
            .map((c) => ({ id: c.id, name: c.name, serviceId: c.service?.id ?? null }))
        );
      })
      .catch(() => setContracts([]))
      .finally(() => setLoadingContracts(false));
  }, [selectedCollection, serviceSelection]);

  const isNewContract = !contractSelection || contractSelection.mode === 'new';
  const canSubmit =
    !!selectedCollection &&
    !!serviceSelection &&
    !!contractSelection &&
    !!date &&
    (!isNewContract || (provider.trim() && title.trim()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !selectedCollection || !serviceSelection || !contractSelection) return;

    setLoading(true);
    setError(null);
    try {
      const result_ = await saveAnalysis(selectedCollection.organization.id, {
        collectionId: selectedCollection.id,
        ...(serviceSelection.mode === 'existing'
          ? { serviceId: serviceSelection.id }
          : { serviceName: serviceSelection.name }),
        ...(contractSelection.mode === 'existing'
          ? { contractId: contractSelection.id }
          : { contractName: contractSelection.name, provider: provider.trim(), title: title.trim() }),
        date: new Date(date).toISOString(),
        text,
        summary: result.summary,
        clauses: result.clauses,
      });
      setSavedResult({
        organizationId: result_.organizationId,
        contractSlug: result_.contractSlug,
        collectionName: selectedCollection.name,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save analysis');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-[90%] max-w-2xl rounded-xl border border-tp-hairline bg-tp-canvas p-6 shadow-elevation-4"
          onClick={(e) => e.stopPropagation()}
        >
          {savedResult ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <MdCheckCircle className="h-10 w-10 text-tp-severity-success" />
              <div>
                <p className="text-base font-semibold text-tp-ink">Analysis saved</p>
                <p className="mt-1 text-sm text-tp-steel">
                  Saved to "{savedResult.collectionName}".
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded-lg border border-tp-hairline px-4 py-2 text-sm text-tp-slate transition-colors hover:bg-tp-surface"
                >
                  Close
                </button>
                <Link
                  to={`/contracts/${savedResult.organizationId}/${savedResult.contractSlug}`}
                  onClick={onClose}
                  className="cursor-pointer rounded-lg bg-tp-primary px-4 py-2 text-sm font-medium text-tp-on-primary transition-colors hover:bg-tp-primary/90"
                >
                  View contract
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-lg font-semibold text-tp-ink">Save analysis</h2>

              {error && (
                <BlockAlert variant="error" className="mb-4" onDismiss={() => setError(null)}>
                  {error}
                </BlockAlert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-tp-ink">Collection</label>
              <select
                value={selectedCollection?.id ?? ''}
                onChange={(e) =>
                  setSelectedCollection(collections.find((c) => c.id === e.target.value) ?? null)
                }
                disabled={loadingCollections}
                className="w-full rounded-lg border border-tp-hairline bg-tp-surface px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
              >
                <option value="">
                  {loadingCollections ? 'Loading collections…' : 'Select a collection'}
                </option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.organization.displayName} / {c.name}
                  </option>
                ))}
              </select>
              {!loadingCollections && collections.length === 0 && (
                <p className="mt-1 text-xs text-tp-steel">
                  You have no collections yet. Create one under your organization first.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-tp-ink">Service</label>
              <EntityPickerInput
                items={services.map((s) => ({ id: s.id, name: s.name }))}
                loading={loadingServices}
                disabled={!selectedCollection}
                selection={serviceSelection}
                onChange={setServiceSelection}
                placeholder={selectedCollection ? 'Search or create a service...' : 'Select a collection first'}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-tp-ink">Contract</label>
              <EntityPickerInput
                items={contracts.map((c) => ({ id: c.id, name: c.name }))}
                loading={loadingContracts}
                disabled={!serviceSelection}
                selection={contractSelection}
                onChange={setContractSelection}
                placeholder={serviceSelection ? 'Search or create a contract...' : 'Select a service first'}
              />
            </div>

            {isNewContract && contractSelection && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-tp-ink">Contract Provider</label>
                  <input
                    type="text"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="e.g. Google"
                    className="w-full rounded-lg border border-tp-hairline bg-tp-surface px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-tp-ink">Contract Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Terms of Service"
                    className="w-full rounded-lg border border-tp-hairline bg-tp-surface px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-tp-ink">Contract Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={todayIsoDate()}
                className="w-full rounded-lg border border-tp-hairline bg-tp-surface px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-lg border border-tp-hairline px-4 py-2 text-sm text-tp-slate transition-colors hover:bg-tp-surface"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="cursor-pointer rounded-lg bg-tp-primary px-4 py-2 text-sm font-medium text-tp-on-primary transition-colors hover:bg-tp-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Save analysis'}
              </button>
            </div>
              </form>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
