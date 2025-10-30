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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 sm:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isCreateTab = tab.id === 'create';
          const isNotificationsTab = tab.id === 'notifications';
          const isProfile = isProfileTab(tab.id);

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className="flex flex-col items-center py-1 px-2 min-w-0 flex-1 relative"
              aria-label={tab.label}
            >
              {isCreateTab ? (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="bg-primary-600 text-white rounded-full p-2 mb-1"
                >
                  <Icon className="w-5 h-5" />
                </motion.div>
              ) : isProfile && user?.profile_image_url ? (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="mb-1"
                >
                  <img
                    src={user.profile_image_url}
                    alt="Profile"
                    className={`w-8 h-8 rounded-full object-cover border-2 ${
                      isActive ? 'border-primary-600' : 'border-gray-300'
                    }`}
                  />
                </motion.div>
              ) : (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-1 mb-1 relative ${
                    isActive ? 'text-primary-600' : 'text-gray-400'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  {isNotificationsTab && unreadCount > 0 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center px-1"
                    >
                      <span className="text-[10px] text-white font-bold">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {!isCreateTab && (
                <span
                  className={`text-xs font-medium truncate ${
                    isActive ? 'text-primary-600' : 'text-gray-400'
                  }`}
                >
                  {tab.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}