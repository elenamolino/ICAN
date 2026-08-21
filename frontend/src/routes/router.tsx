import { Navigate, Outlet, useRoutes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LoadingView from '../modules/core/pages/loading';
import AppLayout from './app-layout';
import ProtectedRoute from '../modules/auth/components/protected-route';
import { useAuth } from '../modules/auth/hooks/useAuth';

import DashboardSkeleton from '../modules/core/components/skeletons/dashboard-skeleton';
import OrgDetailSkeleton from '../modules/core/components/skeletons/org-detail-skeleton';
import OrgJoinSkeleton from '../modules/core/components/skeletons/org-join-skeleton';

export const HomePage = lazy(() => import('../modules/presentation/pages/home'));
export const DashboardPage = lazy(() => import('../modules/presentation/pages/dashboard'));
export const TeamPage = lazy(() => import('../modules/presentation/pages/team'));
export const Page404 = lazy(() => import('../modules/core/pages/page-not-found'));
export const InboxPage = lazy(() => import('../modules/notification/pages/inbox'));

import ResearchPage from '../modules/presentation/pages/research';
import ContributionsPage from '../modules/presentation/pages/contributions';
import ChangelogPage from '../modules/presentation/pages/changelog';
import AuthenticationPage from '../modules/auth/pages/authentication-page';
import SsoCallbackPage from '../modules/auth/pages/sso-callback';
import OrganizationsListPage from '../modules/organization/pages/organizations-list';
import CreateOrganizationPage from '../modules/organization/pages/create-organization';
import OrganizationDetailPage from '../modules/organization/pages/organization-detail';
import OrganizationJoinPage from '../modules/organization/pages/organization-join';
import SettingsPage from '../modules/settings/pages/SettingsPage';
import ApiKeysPage from '../modules/api-keys/pages/ApiKeysPage';
import PlaceholderPage from '../modules/core/pages/placeholder';

function RootPage() {
  const { authUser } = useAuth();

  if (authUser.isLoading) {
    return <LoadingView />;
  }

  if (authUser.isAuthenticated) {
    return (
      <AppLayout>
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardPage />
        </Suspense>
      </AppLayout>
    );
  }

  return (
    <Suspense fallback={<LoadingView />}>
      <HomePage />
    </Suspense>
  );
}

export default function Router() {
  const routes = useRoutes([
    // ═══════════════════════════════════════════════════════════
    // ROOT PAGE (landing when not auth, dashboard when auth)
    // ═══════════════════════════════════════════════════════════
    {
      path: '/',
      element: <RootPage />,
    },

    // ═══════════════════════════════════════════════════════════
    // PUBLIC ROUTES (AppLayout: Public or Authenticated based on auth)
    // ═══════════════════════════════════════════════════════════
    {
      element: (
        <AppLayout>
          <Suspense fallback={<LoadingView />}>
            <Outlet />
          </Suspense>
        </AppLayout>
      ),
      children: [
        { element: <AuthenticationPage />, path: '/authentication' },
        { element: <SsoCallbackPage />, path: '/sso/callback' },
        { element: <TeamPage />, path: '/team' },
        { element: <ResearchPage />, path: '/research' },
        { element: <ContributionsPage />, path: '/contributions' },
        { element: <ChangelogPage />, path: '/changelog' },
        { element: <PlaceholderPage title="Contracts" />, path: '/contracts' },
        { element: <PlaceholderPage title="Collections" />, path: '/collections' },
        { element: <PlaceholderPage title="Docs" />, path: '/docs' },
        { element: <PlaceholderPage title="AI Classify" />, path: '/analyse/ai-classify' },
        { element: <PlaceholderPage title="Ontology Analysis" />, path: '/analyse/ontology-analysis' },
        {
          path: '/orgs/:organizationId',
          element: (
            <Suspense fallback={<OrgDetailSkeleton />}>
              <OrganizationDetailPage />
            </Suspense>
          ),
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // PROTECTED ROUTES (require auth + AuthenticatedLayout)
    // ═══════════════════════════════════════════════════════════
    {
      element: (
        <ProtectedRoute>
          <AppLayout>
            <Suspense fallback={<LoadingView />}>
              <Outlet />
            </Suspense>
          </AppLayout>
        </ProtectedRoute>
      ),
      children: [
        { element: <OrganizationsListPage />, path: '/me/orgs' },
        { element: <SettingsPage />, path: '/me/settings' },
        { element: <ApiKeysPage />, path: '/me/api-keys' },
        { element: <CreateOrganizationPage />, path: '/orgs/new' },
        {
          path: '/orgs/join/:code',
          element: (
            <Suspense fallback={<OrgJoinSkeleton />}>
              <OrganizationJoinPage />
            </Suspense>
          ),
        },
        {
          path: '/notifications',
          element: (
            <Suspense fallback={<LoadingView />}>
              <InboxPage />
            </Suspense>
          ),
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════
    // ERROR / CATCH-ALL
    // ═══════════════════════════════════════════════════════════
    {
      path: 'error',
      element: <Page404 />,
    },
    {
      path: '*',
      element: <Navigate to="/error" replace />,
    },
  ]);

  return routes;
}
