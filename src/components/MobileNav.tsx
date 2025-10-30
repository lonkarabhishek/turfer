import { Home, Plus, User, BarChart3, Bell, Coins, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { type User as UserType } from '../lib/api';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user?: UserType | null;
  onProfileClick?: () => void;
  onCreateGame?: () => void;
  onHomeClick?: () => void;
  onNotificationsClick?: () => void;
  onTossClick?: () => void;
  onFindGamesClick?: () => void;
  unreadCount?: number;
}

export function MobileNav({ activeTab, setActiveTab, user, onProfileClick, onCreateGame, onHomeClick, onNotificationsClick, onTossClick, onFindGamesClick, unreadCount = 0 }: MobileNavProps) {
  const tabs = user?.role === 'owner' ? [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'findGames', label: 'Find Games', icon: Search },
    { id: 'create', label: 'Create', icon: Plus },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'notifications', label: 'Notifications', icon: Bell, showBadge: true },
    { id: 'profile', label: 'Profile', icon: User },
  ] : [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'findGames', label: 'Find Games', icon: Search },
    { id: 'create', label: 'Create', icon: Plus },
    { id: 'notifications', label: 'Notifications', icon: Bell, showBadge: true },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const handleTabClick = (tabId: string) => {
    if (tabId === 'create') {
      onCreateGame?.();
      return;
    }
    if (tabId === 'profile') {
      onProfileClick?.();
      return;
    }
    if (tabId === 'home') {
      onHomeClick?.();
      setActiveTab(tabId);
      return;
    }
    if (tabId === 'notifications') {
      onNotificationsClick?.();
      return;
    }
    if (tabId === 'findGames') {
      onFindGamesClick?.();
      return;
    }
    setActiveTab(tabId);
  };

  const isProfileTab = (tabId: string) => tabId === 'profile';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden" style={{ background: 'var(--neuro-bg)' }}>
      {/* Neumorphic container */}
      <div className="relative px-4 py-4">
        <div className="flex items-center justify-around gap-2">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isCreateTab = tab.id === 'create';
            const isNotificationsTab = tab.id === 'notifications';
            const isProfile = isProfileTab(tab.id);

            return (
              <motion.button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className="flex flex-col items-center min-w-0 flex-1 relative"
                aria-label={tab.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                style={{ background: 'transparent', border: 'none' }}
              >
                {isCreateTab ? (
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="relative mb-1"
                  >
                    <motion.div
                      className="w-14 h-14 flex items-center justify-center neuro-orb"
                    >
                      <motion.div
                        animate={{ rotate: isActive ? 45 : 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      >
                        <Icon className={`w-6 h-6 ${isActive ? 'text-primary-600' : 'text-gray-600'}`} />
                      </motion.div>
                    </motion.div>
                  </motion.div>
                ) : isProfile && user?.profile_image_url ? (
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="relative mb-1"
                  >
                    <motion.div className="p-1 neuro-orb">
                      <img
                        src={user.profile_image_url}
                        alt="Profile"
                        className="w-10 h-10 object-cover"
                        style={{ borderRadius: '16px' }}
                      />
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="relative mb-1"
                  >
                    <motion.div
                      className="w-12 h-12 flex items-center justify-center neuro-orb"
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600' : 'text-gray-600'}`} />
                    </motion.div>

                    {isNotificationsTab && unreadCount > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="neuro-badge absolute -top-1 -right-1 min-w-[20px] h-[20px] rounded-full flex items-center justify-center px-1"
                      >
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: '#E65100' }}
                        >
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {!isCreateTab && (
                  <motion.span
                    className="text-[11px] font-semibold truncate transition-all relative z-10 mt-1"
                    style={{
                      color: isActive ? '#388E3C' : '#78909C'
                    }}
                  >
                    {tab.label}
                  </motion.span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}