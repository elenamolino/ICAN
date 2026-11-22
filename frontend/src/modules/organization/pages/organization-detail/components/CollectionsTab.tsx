import CollectionCard from '../../../../core/components/collection-card';
import { useOrganizationsApi } from '../../../api/organizationsApi';
import { TAB_META } from '../constants';
import OrgContentTab from './OrgContentTab';

export default function CollectionsTab({ orgId }: { orgId: string }) {
  const { getOrgContractCollections } = useOrganizationsApi();

  return (
    <OrgContentTab
      noun="collections"
      title={TAB_META.collections.label}
      icon={TAB_META.collections.icon}
      loadPage={async (filters, signal) => {
        const { collections, total } = await getOrgContractCollections(orgId, filters, signal);
        return { items: collections, total };
      }}
      renderItem={(collection) => <CollectionCard collection={collection} />}
    />
  );
}
