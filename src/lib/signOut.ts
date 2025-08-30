import { authManager } from './api';

export const signOutWithConfirmation = (
  onAuthChange?: () => void,
  customMessage?: string
) => {
  const defaultMessage = 'Are you sure you want to sign out?';
  
  if (window.confirm(customMessage || defaultMessage)) {
    authManager.clearAuth();
    if (onAuthChange) {
      onAuthChange();
    }
    
    // Redirect to home page
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    } else {
      // Force refresh to update UI state
      window.location.reload();
    }
  }
};