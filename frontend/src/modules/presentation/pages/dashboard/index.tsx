import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useOrganization } from '../../../organization/hooks/useOrganization';
import { useRouter } from '../../../core/hooks/useRouter';
import { useRecentItems } from '../../../core/hooks/useRecentItems';
import OrganizationCard from '../../../organization/components/organization-card';
import { staggerContainer, fadeInUp, transitionDefault } from '../../../core/utils/motion-variants';

const RECENT_LIMIT = 3;

export default function DashboardPage() {
  const { authUser } = useAuth();
  const { organizations } = useOrganization();
  const router = useRouter();
  const { recentOrganizations } = useRecentItems();

  const recentOrganizationsData = useMemo(() => {
    const orgMap = new Map<string, { id: string; name: string; displayName: string; avatar: string | null; avatarBgColor?: string; avatarFgColor?: string; isPersonal: boolean }>();
    const flatten = (orgs: typeof organizations) => {
      for (const org of orgs) {
        orgMap.set(org.id, org);
        if (org.subOrganizations) flatten(org.subOrganizations);
      }
    };
    flatten(organizations);
    return recentOrganizations
      .filter(item => orgMap.has(item.id))
      .slice(0, RECENT_LIMIT)
      .map(item => {
        const org = orgMap.get(item.id)!;
        return { ...org, visitedAt: item.visitedAt };
      });
  }, [recentOrganizations, organizations]);

  const firstName = authUser.user?.firstName ?? 'there';

  const stats: { label: string; value: number; icon: React.ReactNode; color: string }[] = [
    {
      label: 'Organizations',
      value: organizations.length,
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
      ),
      color: 'bg-tp-primary/10 text-tp-primary',
    },
  ];

  const quickActions = [
    {
      label: 'Organizations',
      description: 'Manage the organizations you belong to',
      to: '/me/orgs',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
        </svg>
      ),
    },
    {
      label: 'API Keys',
      description: 'Manage your personal API keys',
      to: '/me/api-keys',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
      ),
    },
    {
      label: 'Settings',
      description: 'Update your profile and preferences',
      to: '/me/settings',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transitionDefault}
        className="mb-8"
      >
        <h1 className="font-display text-3xl font-normal text-tp-ink">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-tp-steel">
          Here's an overview of your workspace.
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {stats.map(stat => (
          <motion.div
            key={stat.label}
            variants={fadeInUp}
            transition={transitionDefault}
            className="flex items-center gap-4 rounded-xl border border-tp-hairline bg-tp-canvas p-4"
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-2xl font-semibold text-tp-ink">{stat.value}</p>
              <p className="text-xs text-tp-steel">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left column */}
        <div className="space-y-6">
          {/* Organizations */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...transitionDefault, delay: 0.1 }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-tp-ink">Recent Organizations</h2>
              <button
                type="button"
                onClick={() => router.push('/me/orgs')}
                className="cursor-pointer text-xs text-tp-primary hover:underline"
              >
                View all
              </button>
            </div>

            {recentOrganizationsData.length === 0 ? (
              <div className="rounded-xl border border-tp-hairline bg-tp-canvas p-6 text-center">
                <p className="text-sm text-tp-steel">No recent organizations yet</p>
                <button
                  type="button"
                  onClick={() => router.push('/me/orgs')}
                  className="mt-2 cursor-pointer text-sm font-medium text-tp-primary hover:underline"
                >
                  Browse organizations
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentOrganizationsData.map(org => (
                  <OrganizationCard key={org.id} org={org} />
                ))}
              </div>
            )}
          </motion.section>
        </div>

        {/* Right column — Quick Actions */}
        <motion.aside
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...transitionDefault, delay: 0.2 }}
          className="space-y-3"
        >
          <h2 className="text-sm font-medium text-tp-ink">Quick Actions</h2>

          {quickActions.map(action => (
            <button
              key={action.to}
              type="button"
              onClick={() => router.push(action.to)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-tp-hairline bg-tp-canvas p-4 text-left transition-all hover:border-tp-primary/30 hover:shadow-elevation-1"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tp-surface text-tp-steel">
                {action.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-tp-ink">{action.label}</p>
                <p className="text-[11px] text-tp-steel">{action.description}</p>
              </div>
            </button>
          ))}
        </motion.aside>
      </div>
    </div>
  );
}
