export interface ContractCollection {
  name: string;
  organization: Organization;
}

export interface RetrievedContractCollection {
  id: string;
  slug: string;
  name: string;
  description?: string;
  organization: {
    id: string;
    name: string;
    displayName: string;
    avatar: string;
  };
  contracts: any;
}

interface Organization {
  id: string;
  name: string;
  displayName: string;
  avatar: string;
}
