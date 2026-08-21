export type ContractIndexQueryParams = {
  name?: string;
  sortBy?: SortByType;
  sort?: 'asc' | 'desc';
  selectedOrganizations?: string[];
  collection?: string;
  excludeContractsInCollection?: boolean;
  limit: number;
  offset: number;
};

export type SortByType = 'name' | 'createdAt' | '';
