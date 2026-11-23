import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { format } from 'date-fns';
import Iconify from '../../../core/components/iconify';
import customAlert from '../../../core/utils/custom-alert';
import { DOCUMENT_TYPES, documentTypeDescription, documentTypeLabel, documentTypeOf } from '../../../core/utils/document-types';
import { splitContractName } from '../../../core/utils/editor-import';
import { Agreement, useContractCollectionsApi } from '../../api/contractCollectionsApi';

const ORDER = DOCUMENT_TYPES.map((t) => t.id);

/** The Customer Agreement of a service: one card per document, like a provider's legal centre. */
export default function AgreementPage() {
  const { organizationId, collectionSlug, serviceId } = useParams<{ organizationId: string; collectionSlug: string; serviceId: string }>();
  const [searchParams] = useSearchParams();
  const share = searchParams.get('share');
  const { getAgreement, getAgreementShareToken } = useContractCollectionsApi();
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(share);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!organizationId || !collectionSlug || !serviceId) return;
    getAgreement(organizationId, collectionSlug, serviceId).then(setAgreement).catch((err: Error) => setError(err.message));
    if (!share) getAgreementShareToken(organizationId, collectionSlug, serviceId).then(setToken).catch(() => setToken(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, collectionSlug, serviceId]);

  const permalink = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/ca/${token}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(permalink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await customAlert(`Permanent link: ${permalink}`);
    }
  };

  if (error) {
    return <p className="px-4 py-24 text-center text-sm text-tp-steel">{error}</p>;
  }
  if (!agreement) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Iconify icon="mdi:loading" width={28} className="animate-spin text-tp-muted" />
      </div>
    );
  }

  const documents = [...agreement.contracts].sort(
    (a, b) => ORDER.indexOf(documentTypeOf(a)) - ORDER.indexOf(documentTypeOf(b)) || a.name.localeCompare(b.name)
  );
  const companies = [...new Set(agreement.contracts.map((c) => splitContractName(c.name).company).filter(Boolean))];
  const query = share ? `?share=${share}` : '';

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8">
      <Helmet>
        <title>{`${agreement.service.name} Customer Agreement | ICAN`}</title>
      </Helmet>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-tp-steel">
        <Link to="/collections" className="hover:text-tp-ink">Collections</Link>
        <span>/</span>
        <Link to={`/collections/${organizationId}/${collectionSlug}`} className="hover:text-tp-ink">{agreement.collection.name}</Link>
        <span>/</span>
        <span className="text-tp-ink">{agreement.service.name}</span>
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tp-primary">Customer Agreement</p>
          <h1 className="font-display text-3xl font-normal text-tp-ink">{agreement.service.name}</h1>
          <p className="mt-1 text-sm text-tp-steel">
            {companies.length > 0 && <>By {companies.join(', ')} · </>}
            {documents.length} {documents.length === 1 ? 'document' : 'documents'}
          </p>
        </div>
        {token && (
          <button
            type="button"
            onClick={copy}
            title="Copy the permanent link. Anyone with it can read every document of this agreement, without logging in"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-tp-hairline px-3 py-1.5 text-xs font-medium text-tp-steel transition-colors hover:border-tp-primary hover:text-tp-primary"
          >
            <Iconify icon={copied ? 'mdi:check' : 'mdi:link-variant'} width={14} />
            {copied ? 'Copied' : 'Permanent link'}
          </button>
        )}
      </div>

      {documents.length === 0 ? (
        <p className="rounded-xl border border-tp-hairline bg-tp-canvas px-4 py-12 text-center text-sm text-tp-steel">
          No documents you can see in this agreement.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const type = documentTypeOf(doc);
            const href = `/contracts/${organizationId}/${doc.slug}${query}`;
            const unfair = doc.latestVersionSummary?.unfairClauses;
            return (
              <li key={doc.id} className="flex flex-col rounded-xl border border-tp-hairline bg-tp-canvas p-5 transition-shadow hover:shadow-elevation-2">
                <p className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-tp-steel">
                  <span className="text-tp-primary">{documentTypeLabel(type)}</span>
                  {doc.private && <span className="inline-flex items-center gap-0.5"><Iconify icon="mdi:lock-outline" width={12} />Private</span>}
                </p>
                <h2 className="mt-2 text-lg font-medium leading-snug text-tp-ink">{splitContractName(doc.name).title}</h2>
                {doc.current && (
                  <p className="mt-1 text-xs text-tp-steel">
                    {doc.current.number ? `v${doc.current.number} · ` : ''}
                    {format(new Date(doc.current.capturedAt), 'MMM d, yyyy')}
                  </p>
                )}
                <p className="mt-3 flex-1 text-sm leading-relaxed text-tp-slate">{documentTypeDescription(type)}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Link to={href} className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-tp-primary hover:underline">
                    View document
                    <Iconify icon="mdi:chevron-right" width={16} />
                  </Link>
                  {typeof unfair === 'number' && (
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${unfair > 0 ? 'bg-tp-severity-warning-bg text-tp-severity-warning' : 'bg-tp-severity-success-bg text-tp-severity-success'}`}>
                      {unfair} unfair
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
