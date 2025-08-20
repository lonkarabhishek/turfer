import { ChevronDown, User, LogOut, Building2, Plus } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { motion } from 'framer-motion';
import { authManager, type User as UserType } from '../lib/api';
import { useState } from 'react';

interface TopNavProps {
  currentCity?: string;
  user: UserType | null;
  onAuthChange: () => void;
  onProfileClick?: () => void;
  onCreateGame?: () => void;
}

export function TopNav({ 
  currentCity = 'Your City',
  user,
  onAuthChange,
  onProfileClick,
  onCreateGame
}: TopNavProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    authManager.clearAuth();
    setShowUserMenu(false);
    onAuthChange();
  };

  const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Chennai'];

  const handleCityClick = () => {
    const cityList = cities.join(', ');
    alert(`Coming soon to: ${cityList}! Currently in beta.`);
  };

  return (
    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo and Branding */}
        <div className="flex items-center gap-3">
          <motion.div 
            className="flex items-center gap-2"
            whileHover={{ scale: 1.02 }}
          >
            <div className="w-10 h-10 bg-gradient-to-r from-primary-600 to-primary-500 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            <div>
              <h1 className="font-bold text-xl text-gray-900">TapTurf</h1>
              <p className="text-xs text-gray-500 -mt-1">Book • Play • Repeat</p>
            </div>
          </motion.div>
          
          {/* City Picker */}
          <motion.button
            onClick={handleCityClick}
            className="hidden sm:flex items-center gap-1 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-full px-3 py-1.5 transition-colors ml-4"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="font-semibold text-primary-700 text-sm">{currentCity}</span>
            <ChevronDown className="w-4 h-4 text-primary-600" />
            <Badge className="bg-primary-600 text-white text-xs ml-1">
              Beta
            </Badge>
          </motion.button>
        </div>

        {/* Right Side - Auth & Actions */}
        <div className="flex items-center gap-3">
          {/* Create Game Button - Always Visible */}
          {user && (
            <Button
              onClick={onCreateGame}
              className="hidden sm:flex bg-green-600 hover:bg-green-700 text-sm px-4 py-2"
            >
              <Plus className="w-4 h-4 mr-1" />
              Create Game
            </Button>
          )}

          {/* User Menu or Login Button */}
          {user ? (
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2"
              >
                {user.role === 'owner' ? (
                  <Building2 className="w-4 h-4" />
                ) : (
                  <User className="w-4 h-4" />
                )}
                <span className="hidden sm:inline max-w-32 truncate">{user.name}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border z-20 py-2">
                    <div className="px-4 py-3 border-b">
                      <p className="font-medium text-gray-900">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {user.role === 'owner' ? (
                          <Badge className="bg-blue-100 text-blue-700 text-xs">
                            <Building2 className="w-3 h-3 mr-1" />
                            Turf Owner
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 text-xs">
                            <User className="w-3 h-3 mr-1" />
                            Player
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {/* Mobile Create Game */}
                    <div className="sm:hidden">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onCreateGame?.();
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2 text-green-600"
                      >
                        <Plus className="w-4 h-4" />
                        Create Game
                      </button>
                    </div>
                    
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2 text-red-600"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Button
              onClick={onProfileClick}
              className="bg-primary-600 hover:bg-primary-700 px-4 py-2"
            >
              <User className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}