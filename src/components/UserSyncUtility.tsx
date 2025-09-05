import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ensureUserExists } from '../lib/userSync';

/**
 * This component ensures that authenticated users are properly synced 
 * to the users table. It runs automatically when a user is logged in.
 */
export function UserSyncUtility() {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (user && !synced && !syncing) {
      syncCurrentUser();
    }
  }, [user, synced, syncing]);

  const syncCurrentUser = async () => {
    setSyncing(true);
    console.log('🔄 UserSyncUtility: Starting user sync...');

    try {
      const result = await ensureUserExists();
      
      if (result.success) {
        console.log('✅ UserSyncUtility: User sync completed successfully');
        setSynced(true);
      } else {
        console.error('❌ UserSyncUtility: User sync failed:', result.error);
      }
    } catch (error) {
      console.error('❌ UserSyncUtility: Unexpected error during sync:', error);
    } finally {
      setSyncing(false);
    }
  };

  // This component doesn't render anything visible
  return null;
}