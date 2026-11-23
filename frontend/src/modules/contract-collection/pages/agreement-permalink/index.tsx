import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import LoadingView from '../../../core/pages/loading';
import { useContractCollectionsApi } from '../../api/contractCollectionsApi';

/** /ca/:token, the permanent link to a service's Customer Agreement: opens all its documents to anybody. */
export default function AgreementPermalinkPage() {
  const { token } = useParams<{ token: string }>();
  const { resolveAgreementPermalink } = useContractCollectionsApi();
  const [path, setPath] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    resolveAgreementPermalink(token)
      .then(({ organizationId, collectionSlug, serviceId }) =>
        setPath(`/collections/${organizationId}/${collectionSlug}/agreements/${serviceId}?share=${token}`)
      )
      .catch(() => setNotFound(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (path) return <Navigate to={path} replace />;
  if (!notFound) return <LoadingView />;
  return <p className="px-4 py-24 text-center text-sm text-tp-steel">This link does not lead to any Customer Agreement.</p>;
}
