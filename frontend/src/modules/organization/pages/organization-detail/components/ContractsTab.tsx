import ContractCard from '../../../../core/components/contract-card';
import { useOrganizationsApi } from '../../../api/organizationsApi';
import { TAB_META } from '../constants';
import OrgContentTab from './OrgContentTab';

export default function ContractsTab({ orgId }: { orgId: string }) {
  const { getOrgContracts } = useOrganizationsApi();

  return (
    <OrgContentTab
      noun="contracts"
      title={TAB_META.contracts.label}
      icon={TAB_META.contracts.icon}
      loadPage={async (filters, signal) => {
        const { contracts, total } = await getOrgContracts(orgId, filters, signal);
        return { items: contracts, total };
      }}
      renderItem={(contract) => <ContractCard data={contract} />}
    />
  );
}
