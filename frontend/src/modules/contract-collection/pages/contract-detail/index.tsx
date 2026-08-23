import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import DOMPurify from 'dompurify';
import Iconify from '../../../core/components/iconify';
import { useRouter } from '../../../core/hooks/useRouter';
import { fadeInUp, transitionDefault } from '../../../core/utils/motion-variants';
import { Contract, getContract } from '../../api/contractCollectionsApi';

export default function ContractDetailPage() {
  const { organizationId, collectionSlug, contractSlug } = useParams<{
    organizationId: string;
    collectionSlug: string;
    contractSlug: string;
  }>();
  const router = useRouter();
  const [contract, setContract] = useState<Contract | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !contractSlug) return;
    setIsLoading(true);
    setError(null);
    getContract(organizationId, contractSlug)
      .then(setContract)
      .catch(() => setError('Contract not found'))
      .finally(() => setIsLoading(false));
  }, [organizationId, contractSlug]);

  const sanitizedContent = useMemo(
    () => (contract?.content ? DOMPurify.sanitize(contract.content) : ''),
    [contract?.content]
  );

  const backHref = collectionSlug
    ? `/collections/${organizationId}/${collectionSlug}`
    : contract?.collection
      ? `/collections/${organizationId}/${contract.collection.slug}`
      : '/contracts';
  const backLabel = collectionSlug || contract?.collection ? 'Back to collection' : 'Back to contracts';

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-3xl items-center justify-center px-4 py-8">
        <Iconify icon="mdi:loading" width={28} className="animate-spin text-tp-muted" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <Iconify icon="mdi:file-document-outline" width={32} className="text-tp-muted" />
        <p className="text-sm text-tp-steel">{error ?? 'Contract not found'}</p>
        <button type="button" onClick={() => router.push(backHref)} className="text-sm font-medium text-tp-primary hover:underline">
          {backLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
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

      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeInUp}
        transition={{ ...transitionDefault, delay: 0.05 }}
        className="mt-6 rounded-xl border border-tp-hairline bg-tp-canvas p-6 text-sm leading-relaxed text-tp-ink dark:border-tp-hairline dark:bg-tp-surface [&_a]:text-tp-primary [&_a]:underline [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:first:mt-0 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_p]:mb-3 [&_strong]:font-semibold [&_ul]:mb-3 [&_ul]:list-disc"
      >
        {sanitizedContent ? (
          <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
        ) : (
          <p className="text-sm text-tp-steel">No content available for this contract.</p>
        )}
      </motion.div>
    </div>
  );
}
