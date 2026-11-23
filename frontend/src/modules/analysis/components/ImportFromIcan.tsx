import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ContractCollectionSummary, ContractVersionListItem, useContractCollectionsApi } from '../../contract-collection/api/contractCollectionsApi';
import { OrgContract, useOrganizationsApi } from '../../organization/api/organizationsApi';
import { splitContractName } from '../../core/utils/editor-import';
import { versionTitle } from '../../contract-collection/utils/versions';
import ActionButton from '../../core/components/action-button';

export interface ImportedContract {
  text: string;
  provider: string;
  title: string;
  /** yyyy-mm-dd, the date the version was captured. */
  date: string;
  source: { name: string; href: string };
}

const SELECT = 'w-full cursor-pointer rounded-lg border border-tp-hairline-strong bg-tp-canvas px-3 py-2 text-sm text-tp-ink focus:border-tp-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

/** Picks an agreement already in iCan (collection, contract, version) and hands over its text and details. */
export default function ImportFromIcan({ onImport }: { onImport: (contract: ImportedContract) => void }) {
  const { listCollections, listContractVersions, getContractVersion } = useContractCollectionsApi();
  const { getOrgContracts } = useOrganizationsApi();
  const [collections, setCollections] = useState<ContractCollectionSummary[] | null>(null);
  const [collectionId, setCollectionId] = useState('');
  const [contracts, setContracts] = useState<OrgContract[]>([]);
  const [contractSlug, setContractSlug] = useState('');
  const [versions, setVersions] = useState<ContractVersionListItem[]>([]);
  const [versionId, setVersionId] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collection = collections?.find((c) => c.id === collectionId) ?? null;
  const contract = contracts.find((c) => c.slug === contractSlug) ?? null;

  useEffect(() => {
    listCollections({ limit: 100 })
      .then(({ collections: found }) => setCollections([...found].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setCollections([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setContracts([]);
    setContractSlug('');
    if (!collection) return;
    getOrgContracts(collection.organization.id, { collection: collection.slug, limit: '200', sortBy: 'name', sort: 'asc' })
      .then(({ contracts: found }) => setContracts(found))
      .catch(() => setContracts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  useEffect(() => {
    setVersions([]);
    setVersionId('');
    if (!collection || !contractSlug) return;
    listContractVersions(collection.organization.id, contractSlug)
      .then((found) => {
        setVersions(found);
        setVersionId((found.find((v) => v.label === 'last') ?? found[found.length - 1])?.id ?? '');
      })
      .catch(() => setVersions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractSlug]);

  const handleImport = async () => {
    if (!collection || !contract || !versionId) return;
    setImporting(true);
    setError(null);
    try {
      const version = await getContractVersion(collection.organization.id, contract.slug, versionId);
      const { company, title } = splitContractName(contract.name, contract.service?.name);
      onImport({
        text: version.content ?? '',
        provider: company,
        title,
        date: format(new Date(version.capturedAt), 'yyyy-MM-dd'),
        source: { name: contract.name, href: `/contracts/${collection.organization.id}/${contract.slug}?version=${versionId}` },
      });
    } catch (err: any) {
      setError(err.message || 'The contract could not be imported');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-tp-steel">Choose an agreement saved in iCan. Its text and details fill in the form above.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-tp-steel">
          Collection
          <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} disabled={!collections} className={SELECT}>
            <option value="">{collections ? 'Select a collection' : 'Loading…'}</option>
            {collections?.map((c) => (
              <option key={c.id} value={c.id}>{c.organization.displayName} / {c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-tp-steel">
          Agreement
          <select value={contractSlug} onChange={(e) => setContractSlug(e.target.value)} disabled={!collection} className={SELECT}>
            <option value="">{collection && !contracts.length ? 'No agreements' : 'Select an agreement'}</option>
            {contracts.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-tp-steel">
          Version
          <select value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={!versions.length} className={SELECT}>
            {!versions.length && <option value="">—</option>}
            {versions
              .map((v, i) => ({ v, n: i + 1 }))
              .reverse()
              .map(({ v, n }) => (
                <option key={v.id} value={v.id}>{versionTitle(v, n)}{v.label === 'last' ? ' (current)' : ''}</option>
              ))}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-tp-severity-error">{error}</p>}
      <ActionButton
        text={importing ? 'Importing…' : 'Import agreement'}
        onClick={handleImport}
        disabled={importing || !versionId}
        className="w-full font-bold"
      />
    </div>
  );
}
