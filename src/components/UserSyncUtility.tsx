import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ensureUserExists } from '../lib/userSync';

/**
 * This component ensures that authenticated users are properly synced
 * to the users table. It runs automatically when a user is logged in.
 *
 * For phone/PIN users: They are already in the users table (created during signup)
 * For Supabase Auth users: May need to sync auth.users to users table
 */
export function UserSyncUtility() {
  const { user } = useAuth();
  const [synced, setSynced] = useState(false);
  const syncAttempted = useRef(false);

  useEffect(() => {
    // Only sync once per session
    if (!user || synced || syncAttempted.current) {
      return;
    }

    // Check if this is a phone/PIN authenticated user (has auth_token in localStorage)
    const authToken = localStorage.getItem('auth_token');
    if (authToken) {
      // Phone/PIN users are already in the users table - no sync needed
      console.log('✅ UserSyncUtility: Phone/PIN user detected, skipping sync');
      setSynced(true);
      return;
    }

    // For Supabase Auth users, try to sync once
    syncAttempted.current = true;
    console.log('🔄 UserSyncUtility: Starting user sync for Supabase Auth user...');

    ensureUserExists()
      .then((result) => {
        if (result.success) {
          console.log('✅ UserSyncUtility: User sync completed successfully');
          setSynced(true);
        } else {
          console.log('⚠️ UserSyncUtility: User sync skipped:', result.error);
          // Don't retry - just mark as done to prevent loops
          setSynced(true);
        }
      })
      .catch((error) => {
        console.error('❌ UserSyncUtility: Unexpected error during sync:', error);
        // Don't retry on error
        setSynced(true);
      });
  }, [user, synced]);

  // This component doesn't render anything visible
  return null;
}