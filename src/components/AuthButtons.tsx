import { useState } from 'react';
import { User, Building2, LogOut, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { LoginModal } from './LoginModal';
import { type User as UserType } from '../lib/api';
import { performSignOut } from '../lib/signOut';
import { SignOutModal } from './SignOutModal';

interface AuthButtonsProps {
  user: UserType | null;
  onAuthChange: () => void;
}

export function AuthButtons({ user, onAuthChange }: AuthButtonsProps) {
  const [showUserLogin, setShowUserLogin] = useState(false);
  const [showOwnerLogin, setShowOwnerLogin] = useState(false);
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

  const handleLoginSuccess = () => {
    onAuthChange();
  };

  if (user) {
    return (
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
          <span className="hidden sm:inline">{user.name}</span>
        </Button>

        {showUserMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowUserMenu(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border z-20 py-2">
              <div className="px-4 py-2 border-b">
                <p className="font-medium text-gray-900">{user.name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
                <p className="text-xs text-primary-600 capitalize font-medium">
                  {user.role} Account
                </p>
              </div>
              
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                onClick={() => {
                  setShowUserMenu(false);
                  // Handle settings
                }}
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-red-600"
                onClick={handleLogoutClick}
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setShowUserLogin(true)}
          className="flex items-center gap-2"
        >
          <User className="w-4 h-4" />
          <span className="hidden sm:inline">User Login</span>
        </Button>
        
        <Button
          onClick={() => setShowOwnerLogin(true)}
          className="bg-primary-600 hover:bg-primary-700 flex items-center gap-2"
        >
          <Building2 className="w-4 h-4" />
          <span className="hidden sm:inline">Owner Login</span>
        </Button>
      </div>

      <LoginModal
        open={showUserLogin}
        onClose={() => setShowUserLogin(false)}
        onSuccess={handleLoginSuccess}
        userType="user"
        initialMode="login"
      />

      <LoginModal
        open={showOwnerLogin}
        onClose={() => setShowOwnerLogin(false)}
        onSuccess={handleLoginSuccess}
        userType="owner"
        initialMode="login"
      />

      {/* Sign Out Modal */}
      <SignOutModal
        isOpen={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        onConfirm={handleConfirmSignOut}
        userName={user?.name}
      />
    </>
  );
}