import { Home, Plus, User, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { type User as UserType } from '../lib/api';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user?: UserType | null;
  onProfileClick?: () => void;
  onCreateGame?: () => void;
}

export function MobileNav({ activeTab, setActiveTab, user, onProfileClick, onCreateGame }: MobileNavProps) {
  const tabs = user?.role === 'owner' ? [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'create', label: 'Create Game', icon: Plus },
    { id: 'profile', label: 'Profile', icon: User },
  ] : [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'create', label: 'Create Game', icon: Plus },
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
    setActiveTab(tabId);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 sm:hidden">
      <div className="flex items-center justify-around py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isCreateTab = tab.id === 'create';
          
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className="flex flex-col items-center py-1 px-2 min-w-0 flex-1"
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
                  className={`p-1 mb-1 ${
                    isActive ? 'text-primary-600' : 'text-gray-400'
                  }`}
                >
                  <Icon className="w-6 h-6" />
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