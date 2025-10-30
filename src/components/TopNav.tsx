import { ChevronDown, User, LogOut, Building2, Plus, LayoutDashboard, Settings, HelpCircle, Star, Coins, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { CitySelector } from './CitySelector';
import { motion } from 'framer-motion';
import { authManager, type User as UserType } from '../lib/api';
import { performSignOut } from '../lib/signOut';
import { SignOutModal } from './SignOutModal';
import { NotificationSystem } from './NotificationSystem';
import { NotificationDropdown } from './NotificationDropdown';
import { userHelpers } from '../lib/supabase';
import TapTurfLogo from '../assets/TapTurf_Logo.png';

interface TopNavProps {
  currentCity?: string;
  user: UserType | null;
  onAuthChange: () => void;
  onProfileClick?: () => void;
  onCreateGame?: () => void;
  onCityChange?: (city: string) => void;
  onHomeClick?: () => void;
  onDashboardNavigation?: (section: string) => void;
  onGameNavigation?: (gameId: string) => void;
  onTossClick?: () => void;
  onAdminClick?: () => void;
}

export function TopNav({
  currentCity = 'Your City',
  user,
  onAuthChange,
  onProfileClick,
  onCreateGame,
  onCityChange,
  onHomeClick,
  onDashboardNavigation,
  onGameNavigation,
  onTossClick,
  onAdminClick
}: TopNavProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string>(user?.profile_image_url || '');

  useEffect(() => {
    if (user) {
      // Use the profile photo from user if available, otherwise fetch it
      // Use profile photo from Supabase Auth user_metadata instead of database query
      const profilePhotoUrl = user.profile_image_url || 
                              user.user_metadata?.profile_image_url || 
                              user.user_metadata?.avatar_url || 
                              '';
      setProfilePhotoUrl(profilePhotoUrl);
    } else {
      setProfilePhotoUrl('');
    }
  }, [user]);

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
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
              <img 
                src={TapTurfLogo} 
                alt="TapTurf Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                  // Fallback to gradient background with "T" if logo fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = '<div class="w-10 h-10 bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-xl flex items-center justify-center"><span class="text-white font-bold text-lg">T</span></div>';
                }}
              />
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
          {/* Dashboard Button - Always Visible for logged in users */}
          {user && (
            <Button
              onClick={onProfileClick}
              variant="outline"
              className="hidden sm:flex border-primary-200 bg-primary-50 hover:bg-primary-100 text-primary-700 hover:text-primary-800 text-sm px-4 py-2"
            >
              <LayoutDashboard className="w-4 h-4 mr-1" />
              Dashboard
            </Button>
          )}

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

          {/* Notifications */}
          {user && (
            <NotificationDropdown 
              onGameNavigation={onGameNavigation}
              onRequestsNavigation={() => onDashboardNavigation?.('overview')}
            />
          )}

          {/* User Menu or Login Button */}
          {user ? (
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2"
              >
                {profilePhotoUrl ? (
                  <img
                    src={profilePhotoUrl}
                    alt="Profile"
                    className="w-6 h-6 rounded-full object-cover"
                    onError={() => setProfilePhotoUrl('')}
                  />
                ) : user.role === 'owner' ? (
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
                      <div className="flex items-center gap-3 mb-2">
                        {profilePhotoUrl ? (
                          <img
                            src={profilePhotoUrl}
                            alt="Profile"
                            className="w-10 h-10 rounded-full object-cover"
                            onError={() => setProfilePhotoUrl('')}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                            <span className="text-emerald-600 font-semibold">
                              {user.name?.charAt(0).toUpperCase() || 'U'}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{user.name}</p>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </div>
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
                    
                    {/* Dashboard Link - Only for owners */}
                    {user.role === 'owner' && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onProfileClick?.();
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Building2 className="w-4 h-4" />
                        Owner Dashboard
                      </button>
                    )}

                    {/* Dashboard Overview */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onDashboardNavigation?.('overview');
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <User className="w-4 h-4" />
                      Overview
                    </button>

                    {/* My Games */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onDashboardNavigation?.('games');
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      My Games
                    </button>

                    {/* Game Requests */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onDashboardNavigation?.('overview');
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Star className="w-4 h-4" />
                      Game Requests
                    </button>

                    {/* My Bookings */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onDashboardNavigation?.('bookings');
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Building2 className="w-4 h-4" />
                      My Bookings
                    </button>

                    {/* Profile Settings */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onDashboardNavigation?.('profile');
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Profile Settings
                    </button>

                    {/* Admin Panel - Turf Upload */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onAdminClick?.();
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-orange-50 flex items-center gap-2 border-t border-gray-100"
                    >
                      <ShieldCheck className="w-4 h-4 text-orange-600" />
                      <span className="text-orange-600 font-medium">Admin Panel</span>
                    </button>

                    {/* Help & Support */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        // Navigate to help
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <HelpCircle className="w-4 h-4" />
                      Help & Support
                    </button>

                    {/* Toss Coin */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onTossClick?.();
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Coins className="w-4 h-4" />
                      Toss Coin
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