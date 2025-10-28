import { Home, Plus, User, BarChart3, Bell } from 'lucide-react';
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
  unreadCount?: number;
}

export function MobileNav({ activeTab, setActiveTab, user, onProfileClick, onCreateGame, onHomeClick, onNotificationsClick, unreadCount = 0 }: MobileNavProps) {
  const tabs = user?.role === 'owner' ? [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'create', label: 'Create Game', icon: Plus },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell, showBadge: true },
  ] : [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'create', label: 'Create Game', icon: Plus },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell, showBadge: true },
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
    setActiveTab(tabId);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 sm:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isCreateTab = tab.id === 'create';
          const isNotificationsTab = tab.id === 'notifications';

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