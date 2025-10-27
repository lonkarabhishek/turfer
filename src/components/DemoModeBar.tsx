import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Crown, User, LogOut, Settings, Eye } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { demoDataManager, DEMO_USERS, type DemoUser } from '../lib/demoData';
import { toastManager } from '../lib/toastManager';

interface DemoModeBarProps {
  onUserChange?: (user: DemoUser | null) => void;
}

export function DemoModeBar({ onUserChange }: DemoModeBarProps) {
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    const user = demoDataManager.getCurrentUser();
    console.log('🚀 DemoModeBar initialized with user:', user);
    setCurrentUser(user);
    setIsDemoMode(!!user);
  }, []);

  const handleUserSwitch = (userId: string) => {
    console.log('🔄 Switching to user:', userId);
    const user = demoDataManager.switchToUser(userId);
    console.log('👤 Switched to user:', user);
    setCurrentUser(user);
    setIsDemoMode(true);
    onUserChange?.(user);

    if (user) {
      toastManager.success(
        `Demo Mode`,
        `Switched to ${user.name} (${user.role})`
      );
    }

    setIsExpanded(false);
  };

  const handleSignOut = () => {
    demoDataManager.signOut();
    setCurrentUser(null);
    setIsDemoMode(false);
    onUserChange?.(null);
    toastManager.info('Demo Mode', 'Signed out from demo mode');
    setIsExpanded(false);
  };

  const getUserIcon = (role: string) => {
    switch (role) {
      case 'owner': return Crown;
      case 'user': return User;
      default: return User;
    }
  };

  if (!isDemoMode && !currentUser && !isExpanded) {
    console.log('🟣 Rendering simple Demo Mode button');
    return (
      <div className="fixed top-4 right-4 z-50">
        <Button
          onClick={() => {
            console.log('🟣 Demo Mode button clicked');
            setIsExpanded(true);
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg"
          size="sm"
        >
          <Eye className="w-4 h-4 mr-2" />
          Demo Mode
        </Button>
      </div>
    );
  }

  console.log('🟣 Rendering expanded Demo Mode with user:', currentUser, 'isExpanded:', isExpanded);
  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Current User Bar */}
        <div
          className="flex items-center gap-3 p-3 bg-purple-50 cursor-pointer hover:bg-purple-100 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
            {currentUser && (
              <>
{(() => {
                  const IconComponent = getUserIcon(currentUser.role);
                  return <IconComponent className="w-4 h-4 text-purple-700" />;
                })()}
              </>
            )}
          </div>

          {currentUser && (
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-purple-900 truncate">
                {currentUser.name}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={currentUser.role === 'owner' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {currentUser.role}
                </Badge>
                <span className="text-xs text-purple-600">DEMO</span>
              </div>
            </div>
          )}

          <Settings className={`w-4 h-4 text-purple-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </div>

        {/* Expanded Options */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-gray-100"
            >
              <div className="p-3 space-y-2">
                <div className="text-xs font-medium text-gray-500 mb-2">
                  Switch Demo User:
                </div>

                {DEMO_USERS.map(user => {
                  console.log('🟣 Rendering demo user option:', user.name, user.role);
                  const UserIcon = getUserIcon(user.role);
                  const isActive = currentUser?.id === user.id;

                  return (
                    <button
                      key={user.id}
                      onClick={() => handleUserSwitch(user.id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-purple-100 text-purple-900'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                      disabled={isActive}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        user.role === 'owner'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        <UserIcon className="w-3 h-3" />
                      </div>

                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {user.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {user.email} • {user.role}
                        </div>
                      </div>

                      {isActive && (
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                      )}
                    </button>
                  );
                })}

                <div className="border-t border-gray-100 pt-2 mt-3">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors text-sm"
                  >
                    <LogOut className="w-4 h-4" />
                    Exit Demo Mode
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}