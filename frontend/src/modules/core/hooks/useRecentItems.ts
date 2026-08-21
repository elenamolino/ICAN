import { useCallback, useMemo, useState } from 'react';
import {
  addRecentOrganization as addRecentOrganizationUtil,
  getRecentOrganizations as getRecentOrganizationsUtil,
  type RecentItem,
} from '../utils/recentItems';

export type { RecentItem };

export function useRecentItems() {
  const [recentOrganizations, setRecentOrganizations] = useState<RecentItem[]>(() => getRecentOrganizationsUtil());

  const addRecentOrganization = useCallback((item: Omit<RecentItem, 'visitedAt'>) => {
    addRecentOrganizationUtil(item);
    setRecentOrganizations(getRecentOrganizationsUtil());
  }, []);

  return useMemo(() => ({
    recentOrganizations,
    addRecentOrganization,
  }), [recentOrganizations, addRecentOrganization]);
}
