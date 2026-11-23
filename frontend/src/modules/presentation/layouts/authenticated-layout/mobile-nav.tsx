import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from '../../../core/hooks/useRouter';
import { useAuth } from '../../../auth/hooks/useAuth';
import { staggerContainer, menuItemVariants, transitionFast } from '../../../core/utils/motion-variants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_STRUCTURE = [
  {
    label: 'Analyse',
    children: [
      { label: 'Abusive Analysis', to: '/analyse/ai-classify' },
      { label: 'Full Analysis', to: '/analyse/ontology-analysis' },
    ],
  },
  {
    label: 'Explore',
    children: [
      { label: 'Contracts', to: '/contracts' },
      { label: 'Collections', to: '/collections' },
    ],
  },
  { label: 'Editor', to: '/editor' },
  { label: 'Docs', to: '/docs' },
  {
    label: 'Organizations',
    to: '/me/orgs',
  },
];

export default function MobileNav({ isOpen, onClose }: Props) {
  const router = useRouter();
  const { authUser, logout } = useAuth();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const handleNavigate = (to: string) => {
    router.push(to);
    onClose();
  };

  const handleLogout = () => {
    logout();
    onClose();
    router.push('/');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 cursor-pointer bg-tp-ink/20 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 right-0 top-0 z-50 w-75 bg-tp-canvas shadow-elevation-4"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-tp-hairline px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-[0.22em] text-tp-ink">ICAN</span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-tp-steel transition-colors hover:bg-tp-surface hover:text-tp-ink"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* User info */}
              {authUser.isAuthenticated && (
                <div className="border-b border-tp-hairline px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-tp-cream text-sm font-semibold text-tp-primary">
                      {authUser.user?.firstName?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-tp-ink">{authUser.user?.firstName}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Nav items */}
              <motion.nav
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="flex-1 overflow-y-auto px-3 py-4"
              >
                {NAV_STRUCTURE.map(item => (
                  <motion.div key={item.label} variants={menuItemVariants} transition={transitionFast}>
                    {item.children ? (
                      <div className="mb-1">
                        <button
                          type="button"
                          onClick={() => setExpandedGroup(prev => prev === item.label ? null : item.label)}
                          className="flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-tp-ink transition-colors hover:bg-tp-surface"
                        >
                          {item.label}
                          <svg
                            className={`h-4 w-4 text-tp-steel transition-transform ${expandedGroup === item.label ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <AnimatePresence>
                          {expandedGroup === item.label && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="ml-3 border-l border-tp-hairline py-1 pl-3">
                                {item.children.map(child => (
                                  <button
                                    key={child.to}
                                    type="button"
                                    onClick={() => handleNavigate(child.to)}
                                    className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-tp-slate transition-colors hover:bg-tp-surface hover:text-tp-ink"
                                  >
                                    {child.label}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleNavigate(item.to!)}
                        className="mb-1 block w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm font-medium text-tp-ink transition-colors hover:bg-tp-surface"
                      >
                        {item.label}
                      </button>
                    )}
                  </motion.div>
                ))}
              </motion.nav>

              {/* Footer actions */}
              <div className="border-t border-tp-hairline px-3 py-3">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full cursor-pointer items-center justify-center rounded-lg px-4 py-2.5 text-sm text-tp-steel transition-colors hover:bg-tp-surface hover:text-tp-ink"
                >
                  Logout
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
