import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MdCheckCircle } from 'react-icons/md';
import BlockAlert from '../../core/components/block-alert';
import { nextVersionNumbers } from '../../contract-collection/utils/versions';
import { useAuth } from '../../auth/hooks/useAuth';
import { useOrganizationsApi } from '../../organization/api/organizationsApi';
import { flattenOrganizations, OrganizationChoice } from '../../core/utils/flatten-organizations';
import {
  ContractCollectionSummary,
  ContractVersionListItem,
  useContractCollectionsApi,
} from '../../contract-collection/api/contractCollectionsApi';
import { listServices, ServiceSummary } from '../../contract-collection/api/servicesApi';
import { useAnalysisApi, AnalyzeResponse, SaveAnalysisResult } from '../api/analysisApi';
import EntityPickerInput, { EntitySelection } from './EntityPickerInput';

interface SaveAnalysisModalProps {
  open: boolean;
  onClose: () => void;
  text: string;
  result: AnalyzeResponse;
  // Set upfront on the AI Classify page (before analyzing) and fixed here —
  // this modal never asks for them again.
  provider: string;
  title: string;
  date: string;
  /** Told where the analysis went, so a caller can keep saving to the same contract. */
  onSaved?: (saved: SaveAnalysisResult & { collectionId: string; collectionName: string }) => void;
  /** Heading and button text; the editor saves a contract rather than an analysis. */
  heading?: string;
  submitLabel?: string;
  /** Name for the version this save creates. */
  versionName?: string;
  /** Given by the editor: the service written in the contract. */
  serviceName?: string;
  /** Given by the editor: number the version, a major or a minor step after the last one. */
  versionStep?: 'minor' | 'major';
}

export default function SaveAnalysisModal({
  open, onClose, text, result, provider, title, date, onSaved, heading = 'Save analysis', submitLabel = 'Save analysis', versionName,
  serviceName, versionStep,
}: SaveAnalysisModalProps) {
  const { getMyOrganizations } = useOrganizationsApi();
  const { saveAnalysis } = useAnalysisApi();
  const { listCollections, listContracts, listContractVersions, createCollection } = useContractCollectionsApi();
  const { fetchWithInterceptor } = useAuth();

  const [orgs, setOrgs] = useState<OrganizationChoice[]>([]);
  const [collections, setCollections] = useState<ContractCollectionSummary[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<ContractCollectionSummary | null>(null);

  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionOrgId, setNewCollectionOrgId] = useState('');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionPrivate, setNewCollectionPrivate] = useState(true);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [createCollectionError, setCreateCollectionError] = useState<string | null>(null);

  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceSelection, setServiceSelection] = useState<EntitySelection | null>(null);

  const [contracts, setContracts] = useState<Array<{ id: string; name: string; serviceId: string | null; slug: string }>>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [contractSelection, setContractSelection] = useState<EntitySelection | null>(null);

  const [existingVersions, setExistingVersions] = useState<ContractVersionListItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [attachVersionId, setAttachVersionId] = useState('');

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
    setExistingVersions([]);
    setAttachVersionId('');
    setError(null);
    setLoading(false);
    setSavedResult(null);
    setShowCreateCollection(false);
    setNewCollectionOrgId('');
    setNewCollectionName('');
    setNewCollectionPrivate(true);
    setCreateCollectionError(null);
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
        setOrgs(myOrgs);

        const orgIds = myOrgs.map((o) => o.id);
        if (orgIds.length === 0) {
          setCollections([]);
          return;
        }
        const { collections: myCollections } = await listCollections({ organizationIds: orgIds, limit: 100 });
        setCollections(myCollections);
        setShowCreateCollection(myCollections.length === 0);
      } catch {
        setCollections([]);
      } finally {
        setLoadingCollections(false);
      }
    })();
  }, [open, getMyOrganizations, resetAll]);

  const handleCreateCollection = async () => {
    if (!newCollectionOrgId || !newCollectionName.trim()) return;

    setCreatingCollection(true);
    setCreateCollectionError(null);
    try {
      const collection = await createCollection(newCollectionOrgId, {
        name: newCollectionName.trim(),
        private: newCollectionPrivate,
      });
      setCollections((prev) => [...prev, collection]);
      setSelectedCollection(collection);
      setShowCreateCollection(false);
      setNewCollectionOrgId('');
      setNewCollectionName('');
      setNewCollectionPrivate(true);
    } catch (err: any) {
      setCreateCollectionError(err.message || 'Failed to create collection');
    } finally {
      setCreatingCollection(false);
    }
  };

  useEffect(() => {
    setServiceSelection(null);
    setContracts([]);
    setContractSelection(null);

    if (!selectedCollection) {
      setServices([]);
      return;
    }

    setLoadingServices(true);
    listServices({ collectionId: selectedCollection.id }, fetchWithInterceptor)
      .then((found) => {
        setServices(found);
        const name = serviceName?.trim();
        if (!name) return;
        const same = found.find((s) => s.name.toLowerCase() === name.toLowerCase());
        setServiceSelection(same ? { mode: 'existing', id: same.id, name: same.name } : { mode: 'new', name });
      })
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
            .map((c) => ({ id: c.id, name: c.name, serviceId: c.service?.id ?? null, slug: c.slug }))
        );
      })
      .catch(() => setContracts([]))
      .finally(() => setLoadingContracts(false));
  }, [selectedCollection, serviceSelection]);

  useEffect(() => {
    setAttachVersionId('');

    if (!selectedCollection || !contractSelection || contractSelection.mode !== 'existing') {
      setExistingVersions([]);
      return;
    }
    const contract = contracts.find((c) => c.id === contractSelection.id);
    if (!contract) {
      setExistingVersions([]);
      return;
    }

    setLoadingVersions(true);
    listContractVersions(selectedCollection.organization.id, contract.slug)
      .then(setExistingVersions)
      .catch(() => setExistingVersions([]))
      .finally(() => setLoadingVersions(false));
    // listContractVersions comes from useContractCollectionsApi and isn't
    // memoized (new reference every render) — same reasoning as the effect
    // above omitting listContracts/listServices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection, contractSelection, contracts]);

  const isNewContract = !contractSelection || contractSelection.mode === 'new';
  // The next number comes from the contract's versions, so wait for them.
  const canSubmit = !!selectedCollection && !!serviceSelection && !!contractSelection && !(versionStep && loadingVersions);

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
          ? { contractId: contractSelection.id, ...(attachVersionId ? { versionId: attachVersionId } : {}) }
          : { contractName: contractSelection.name, provider: provider.trim(), title: title.trim() }),
        date: new Date(date).toISOString(),
        ...(versionStep && !attachVersionId
          ? { versionNumber: nextVersionNumbers(existingVersions)[versionStep] }
          : {}),
        ...(versionName?.trim() && !attachVersionId ? { versionName: versionName.trim() } : {}),
        text,
        summary: result.summary,
        clauses: result.clauses,
      });
      setSavedResult({
        organizationId: result_.organizationId,
        contractSlug: result_.contractSlug,
        collectionName: selectedCollection.name,
      });
      onSaved?.({ ...result_, collectionId: selectedCollection.id, collectionName: selectedCollection.name });
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
              <h2 className="mb-4 text-lg font-semibold text-tp-ink">{heading}</h2>

              {error && (
                <BlockAlert variant="error" className="mb-4" onDismiss={() => setError(null)}>
                  {error}
                </BlockAlert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-tp-ink">Collection</label>
                {collections.length > 0 && !showCreateCollection && (
                  <button
                    type="button"
                    onClick={() => setShowCreateCollection(true)}
                    className="cursor-pointer text-xs font-medium text-tp-primary hover:underline"
                  >
                    + New collection
                  </button>
                )}
              </div>

              {!showCreateCollection && (
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
                      {orgs.find((o) => o.id === c.organization.id)?.label ?? c.organization.displayName} / {c.name}
                    </option>
                  ))}
                </select>
              )}

              {showCreateCollection && (
                <div className="space-y-2 rounded-lg border border-tp-hairline bg-tp-surface p-3">
                  {!loadingCollections && collections.length === 0 && (
                    <p className="text-xs text-tp-steel">You have no collections yet. Create one below.</p>
                  )}
                  {createCollectionError && (
                    <BlockAlert variant="error" onDismiss={() => setCreateCollectionError(null)}>
                      {createCollectionError}
                    </BlockAlert>
                  )}
                  {/* Organization names can be long: each field takes its own row
                      on narrow screens and half the width otherwise, never more. */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex min-w-0 flex-col gap-1 text-xs text-tp-steel">
                      Organization
                      <select
                        value={newCollectionOrgId}
                        onChange={(e) => setNewCollectionOrgId(e.target.value)}
                        className="w-full min-w-0 cursor-pointer truncate rounded-lg border border-tp-hairline bg-tp-canvas px-2 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                      >
                        <option value="">Select an organization</option>
                        {orgs.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1 text-xs text-tp-steel">
                      Collection name
                      <input
                        type="text"
                        value={newCollectionName}
                        onChange={(e) => setNewCollectionName(e.target.value)}
                        placeholder="For example: Course projects"
                        className="w-full min-w-0 rounded-lg border border-tp-hairline bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                      />
                    </label>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-tp-steel">
                    <input
                      type="checkbox"
                      checked={newCollectionPrivate}
                      onChange={(e) => setNewCollectionPrivate(e.target.checked)}
                      className="cursor-pointer rounded border-tp-hairline text-tp-primary focus:ring-tp-primary"
                    />
                    Private collection (only members of the organization can see it)
                  </label>
                  <div className="flex justify-end gap-2">
                    {collections.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateCollection(false);
                          setNewCollectionName('');
                          setCreateCollectionError(null);
                        }}
                        className="cursor-pointer rounded-lg px-3 py-1.5 text-xs text-tp-slate hover:bg-tp-canvas"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCreateCollection}
                      disabled={creatingCollection || !newCollectionOrgId || !newCollectionName.trim()}
                      className="cursor-pointer rounded-lg bg-tp-primary px-3 py-1.5 text-xs font-medium text-tp-on-primary transition-colors hover:bg-tp-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingCollection ? 'Creating…' : 'Create collection'}
                    </button>
                  </div>
                </div>
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

            {!isNewContract && contractSelection && existingVersions.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-tp-ink">Attach to</label>
                <select
                  value={attachVersionId}
                  onChange={(e) => setAttachVersionId(e.target.value)}
                  disabled={loadingVersions}
                  className="w-full rounded-lg border border-tp-hairline bg-tp-surface px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none"
                >
                  <option value="">Create new version</option>
                  {existingVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {new Date(v.capturedAt).toLocaleDateString()} ({v.label})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-tp-steel">
                  Attaching adds this analysis to that version alongside whatever it already has,
                  instead of creating a new one.
                </p>
              </div>
            )}

            {isNewContract && contractSelection && (
              <p className="text-xs text-tp-steel">
                Will be saved as "{provider} — {title}", dated {date}.
              </p>
            )}

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
                {loading ? 'Saving…' : submitLabel}
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
