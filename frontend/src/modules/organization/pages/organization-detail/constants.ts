import { OrgRole } from '../../api/organizationsApi';
import { Tab } from './types';
import { IconType } from 'react-icons';

export const ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

export const ROLE_COLORS: Record<OrgRole, string> = {
  OWNER: 'bg-tp-primary/10 text-tp-primary',
  ADMIN: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  MEMBER: 'bg-tp-surface text-tp-steel',
};

export const TAB_META: Record<Tab, { label: string; icon: string; iconComponent?: IconType }> = {
  overview: { label: 'Overview', icon: 'mdi:view-dashboard-outline' },
  members: { label: 'Members', icon: 'mdi:account-group-outline' },
  invitations: { label: 'Invitations', icon: 'mdi:link-variant' },
  children: { label: 'Hierarchy', icon: 'mdi:graph-outline' },
  permissions: { label: 'Permissions', icon: 'mdi:shield-lock-outline' },
};
