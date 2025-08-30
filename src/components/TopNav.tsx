import { ChevronDown, User, LogOut, Building2, Plus } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { CitySelector } from './CitySelector';
import { motion } from 'framer-motion';
import { authManager, type User as UserType } from '../lib/api';
import { performSignOut } from '../lib/signOut';
import { SignOutModal } from './SignOutModal';
import { useState } from 'react';

interface TopNavProps {
  currentCity?: string;
  user: UserType | null;
  onAuthChange: () => void;
  onProfileClick?: () => void;
  onCreateGame?: () => void;
  onCityChange?: (city: string) => void;
  onHomeClick?: () => void;
}

export function TopNav({ 
  currentCity = 'Your City',
  user,
  onAuthChange,
  onProfileClick,
  onCreateGame,
  onCityChange,
  onHomeClick
}: TopNavProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const handleLogoutClick = () => {
    setShowUserMenu(false);
    setShowSignOutModal(true);
  };

  const handleConfirmSignOut = () => {
    setShowSignOutModal(false);
    performSignOut(onAuthChange);
  };


  return (
    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo and Branding */}
        <div className="flex items-center gap-3">
          <motion.div 
            className="flex items-center gap-2 cursor-pointer"
            whileHover={{ scale: 1.02 }}
            onClick={onHomeClick}
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
          <div className="ml-2 md:ml-4">
            <CitySelector 
              currentCity={currentCity} 
              onCityChange={(city) => onCityChange?.(city)} 
            />
          </div>
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
                    
                    {/* Dashboard Link */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onProfileClick?.();
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      {user.role === 'owner' ? (
                        <>
                          <Building2 className="w-4 h-4" />
                          Owner Dashboard
                        </>
                      ) : (
                        <>
                          <User className="w-4 h-4" />
                          My Dashboard
                        </>
                      )}
                    </button>
                    
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
                    
                    <div className="border-t border-gray-200 pt-2 mt-2">
                      <button
                        onClick={handleLogoutClick}
                        className="w-full px-4 py-3 text-left hover:bg-red-50 flex items-center gap-2 text-red-600 font-medium rounded-lg mx-2 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Button
              onClick={onProfileClick}
              className="bg-primary-600 hover:bg-primary-700 px-3 md:px-4 py-2 text-sm md:text-base h-8 md:h-10"
            >
              <User className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">Sign </span>In
            </Button>
          )}
        </div>
      </div>

      {/* Sign Out Modal */}
      <SignOutModal
        isOpen={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        onConfirm={handleConfirmSignOut}
        userName={user?.name}
      />
    </div>
  );
}