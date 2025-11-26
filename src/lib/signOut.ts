import { supabase } from './supabase';

export const performSignOut = async (onAuthChange?: () => void) => {
  try {
    // Clear Firebase-based auth from localStorage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');

    // Sign out with Supabase Auth
    await supabase.auth.signOut();

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
  } catch (error) {
    console.error('Error signing out:', error);
    // Force refresh even if there's an error
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