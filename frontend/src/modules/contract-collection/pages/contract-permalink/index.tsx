import { useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import LoadingView from '../../../core/pages/loading';
import { useContractCollectionsApi } from '../../api/contractCollectionsApi';
import { useAuth } from '../../../auth/hooks/useAuth';

/** /a/:token (agreement; in SPHERE /p/ is a pricing and /c/ a collection): opens the contract to anybody. */
export default function ContractPermalinkPage() {
  const { token } = useParams<{ token: string }>();
  const { search } = useLocation();
  const { authUser } = useAuth();
  const { resolvePermalink } = useContractCollectionsApi();
  const [path, setPath] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token || authUser.isLoading) return;
    resolvePermalink(token)
      .then(({ organizationId, contractSlug }) => setPath(`/contracts/${organizationId}/${contractSlug}`))
      .catch(() => setNotFound(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authUser.isLoading]);

  if (path) {
    const query = new URLSearchParams(search);
    query.set('share', token!);
    return <Navigate to={`${path}?${query}`} replace />;
  }
  if (!notFound) return <LoadingView />;
  return (
    <p className="px-4 py-24 text-center text-sm text-tp-steel">
      This link does not lead to any contract. It may have been deleted, or the link is incomplete.
    </p>
  );
}
