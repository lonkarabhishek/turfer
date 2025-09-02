// Hook for managing notifications
import { useState, useEffect } from 'react';
import { notificationHelpers } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata?: any;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Load notifications for the current user
  const loadNotifications = async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const [notifResponse, countResponse] = await Promise.all([
        notificationHelpers.getUserNotifications(user.id),
        notificationHelpers.getUnreadCount(user.id)
      ]);

      if (notifResponse.data) {
        setNotifications(notifResponse.data);
      }
      
      if (typeof countResponse.data === 'number') {
        setUnreadCount(countResponse.data);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mark a notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      const response = await notificationHelpers.markAsRead(notificationId);
      if (response.data) {
        // Update local state
        setNotifications(prev => 
          prev.map(notif => 
            notif.id === notificationId 
              ? { ...notif, is_read: true }
              : notif
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.is_read);
      await Promise.all(unreadNotifications.map(n => markAsRead(n.id)));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Create a new notification (for testing or admin purposes)
  const createNotification = async (type: string, title: string, message: string, metadata?: any) => {
    if (!user) return;

    try {
      const response = await notificationHelpers.createNotification(
        user.id,
        type,
        title,
        message,
        metadata
      );
      
      if (response.data) {
        // Add to local state
        setNotifications(prev => [response.data, ...prev]);
        if (!response.data.is_read) {
          setUnreadCount(prev => prev + 1);
        }
      }
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  };

  // Load notifications on mount and when user changes
  useEffect(() => {
    loadNotifications();
  }, [user]);

  // Refresh notifications periodically (every 30 seconds)
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      loadNotifications();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [user]);

  return {
    notifications,
    unreadCount,
    loading,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    createNotification
  };
}