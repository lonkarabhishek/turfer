import { authManager } from './api';

export const performSignOut = (onAuthChange?: () => void) => {
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
};

// Legacy function for backward compatibility - now just shows the modal trigger
export const signOutWithConfirmation = (
  onAuthChange?: () => void,
  customMessage?: string
) => {
  // This will be handled by the modal now
  console.warn('signOutWithConfirmation is deprecated - use SignOutModal component instead');
};