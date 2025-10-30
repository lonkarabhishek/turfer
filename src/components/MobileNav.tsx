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
    <div className="fixed bottom-0 left-0 right-0 z-50 sm:hidden">
      {/* Gradient background with blur effect */}
      <div className="absolute inset-0 bg-gradient-to-t from-white via-white to-white/95 backdrop-blur-xl border-t border-gray-200/80" />

      {/* Active tab indicator */}
      <div className="relative">
        <div className="flex items-center justify-around py-3 px-2">
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
                className="flex flex-col items-center py-1 px-2 min-w-0 flex-1 relative"
                aria-label={tab.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                {/* Active background glow */}
                {isActive && !isCreateTab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-primary-50 rounded-2xl"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}

                {isCreateTab ? (
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className="relative bg-gradient-to-br from-primary-500 to-primary-600 text-white rounded-2xl p-3 mb-1 shadow-lg shadow-primary-500/50"
                  >
                    <motion.div
                      animate={{ rotate: isActive ? 90 : 0 }}
                      transition={{ type: "spring", stiffness: 200, damping: 10 }}
                    >
                      <Icon className="w-6 h-6" />
                    </motion.div>

                    {/* Pulse animation */}
                    <motion.div
                      className="absolute inset-0 bg-primary-400 rounded-2xl"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 0, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </motion.div>
                ) : isProfile && user?.profile_image_url ? (
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="relative mb-1 z-10"
                  >
                    <motion.img
                      src={user.profile_image_url}
                      alt="Profile"
                      className={`w-10 h-10 rounded-full object-cover border-2 transition-all ${
                        isActive
                          ? 'border-primary-600 shadow-lg shadow-primary-500/30'
                          : 'border-gray-300'
                      }`}
                      animate={{
                        scale: isActive ? 1 : 0.95,
                      }}
                    />
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-primary-400"
                        animate={{
                          scale: [1, 1.3, 1],
                          opacity: [0.3, 0, 0.3],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                        }}
                      />
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    whileHover={{ scale: 1.1, y: -2 }}
                    whileTap={{ scale: 0.9 }}
                    className="relative mb-1 z-10"
                  >
                    <motion.div
                      className={`p-2 rounded-xl transition-all ${
                        isActive
                          ? 'text-primary-600 bg-primary-100/50'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                      animate={{
                        y: isActive ? -2 : 0,
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <Icon className="w-6 h-6" />
                    </motion.div>

                    {isNotificationsTab && unreadCount > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 min-w-[20px] h-[20px] bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center px-1 shadow-lg shadow-red-500/50 border-2 border-white"
                      >
                        <motion.span
                          className="text-[10px] text-white font-bold"
                          animate={{
                            scale: [1, 1.2, 1],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                          }}
                        >
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </motion.span>
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {!isCreateTab && (
                  <motion.span
                    className={`text-[11px] font-semibold truncate transition-all relative z-10 ${
                      isActive
                        ? 'text-primary-600'
                        : 'text-gray-500'
                    }`}
                    animate={{
                      y: isActive ? -1 : 0,
                      fontWeight: isActive ? 700 : 600,
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