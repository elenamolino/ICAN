import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Iconify from '../../../core/components/iconify';
import BlockAlert from '../../../core/components/block-alert';
import { transitionFast } from '../../../core/utils/motion-variants';
import { flattenOrganizations, OrganizationChoice } from '../../../core/utils/flatten-organizations';
import { useOrganizationsApi } from '../../../organization/api/organizationsApi';
import { ContractCollectionSummary, useContractCollectionsApi } from '../../api/contractCollectionsApi';

interface Props {
  collection: ContractCollectionSummary;
  organizationId: string;
  onClose: () => void;
  onMoved: (targetOrganizationId: string) => void;
}

/** Moves a collection, with its contracts, to another organization the user manages. */
export default function MoveCollectionModal({ collection, organizationId, onClose, onMoved }: Props) {
  const { getMyOrganizations } = useOrganizationsApi();
  const { transferCollection } = useContractCollectionsApi();
  const [choices, setChoices] = useState<OrganizationChoice[] | null>(null);
  const [targetId, setTargetId] = useState('');
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyOrganizations({ limit: 100 })
      .then((data) => {
        if (!active) return;
        const orgs = flattenOrganizations(Array.isArray(data) ? data : data.items || []);
        setChoices(orgs.filter((o) => o.id !== organizationId && (o.role === 'OWNER' || o.role === 'ADMIN')));
      })
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
    // Only on opening: getMyOrganizations changes identity whenever the token renews.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMoving(true);
    setError(null);
    try {
      await transferCollection(organizationId, collection.slug, targetId);
      onMoved(targetId);
    } catch (err: any) {
      setError(err.message || 'Failed to move the collection');
      setMoving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-tp-ink/30 p-4 backdrop-blur-sm"
      onClick={() => !moving && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={transitionFast}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-collection-title"
        className="w-full max-w-112 rounded-xl border border-tp-hairline bg-tp-canvas p-6 shadow-elevation-4"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="move-collection-title" className="font-display text-xl text-tp-ink">Move collection</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={moving}
            aria-label="Close"
            className="cursor-pointer text-tp-steel transition-colors hover:text-tp-ink"
          >
            <Iconify icon="mdi:close" width={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-tp-steel">
            “{collection.name}” moves with all its contracts and versions, and its links change. Permissions given
            to individual people on them are removed.
            {collection.private && ' It is private, so members of the new organization will be able to see it.'}
          </p>
          {error && (
            <BlockAlert variant="error" onDismiss={() => setError(null)}>
              {error}
            </BlockAlert>
          )}
          {choices?.length === 0 ? (
            <p className="text-sm text-tp-ink">You are not an owner or admin of any other organization.</p>
          ) : (
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-tp-steel">
              New organization
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                disabled={!choices || moving}
                className="w-full min-w-0 cursor-pointer truncate rounded-lg border border-tp-input-border bg-tp-input-bg px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-tp-ink outline-none focus:border-tp-primary"
              >
                <option value="">{choices ? 'Select an organization' : 'Loading organizations…'}</option>
                {choices?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={moving}
              className="cursor-pointer rounded-lg border border-tp-hairline-strong px-4 py-2 text-sm font-medium text-tp-slate transition-colors hover:bg-tp-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={moving || !targetId}
              className="cursor-pointer rounded-lg bg-tp-primary px-4 py-2 text-sm font-medium text-tp-on-primary transition-colors hover:bg-tp-primary-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {moving ? 'Moving…' : 'Move'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
