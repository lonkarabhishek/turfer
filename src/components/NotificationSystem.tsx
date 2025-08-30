import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, X, Check, Info, AlertCircle, CheckCircle, 
  XCircle, Clock, Users, Calendar, MapPin, Gamepad2,
  MessageCircle, Settings, Loader, BellRing
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

export interface Notification {
  id: string;
  userId: string;
  type: 'game_request' | 'game_accepted' | 'game_declined' | 'game_reminder' | 'booking_confirmation' | 'system';
  title: string;
  message: string;
  metadata?: {
    gameId?: string;
    requestId?: string;
    bookingId?: string;
    turfName?: string;
    date?: string;
    time?: string;
    actionUrl?: string;
  };
  read: boolean;
  createdAt: string;
  expiresAt?: string;
}

interface NotificationSystemProps {
  onNotificationClick?: (notification: Notification) => void;
  maxVisible?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function NotificationSystem({ 
  onNotificationClick, 
  maxVisible = 5,
  position = 'top-right' 
}: NotificationSystemProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    if (user) {
      loadNotifications();
      setupRealtimeSubscription();
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
      }
    };
  }, [user]);

  const loadNotifications = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // For now, start with empty notifications
      // In the future, this would load from a notifications table
      setNotifications([]);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscription = () => {
    if (!user) return;

    // Subscribe to real-time notifications using Supabase
    subscriptionRef.current = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        const newNotification = payload.new as Notification;
        setNotifications(prev => [newNotification, ...prev]);
        
        // Show toast notification for new notifications
        showToastNotification(newNotification);
      })
      .subscribe();
  };

  const showToastNotification = (notification: Notification) => {
    // Create a temporary toast notification
    const toast = document.createElement('div');
    toast.className = `fixed ${getPositionClasses()} z-[200] p-4 bg-white border border-gray-200 rounded-lg shadow-lg max-w-sm transform transition-all duration-300`;
    toast.style.transform = 'translateX(100%)';
    
    toast.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0">
          ${getNotificationIcon(notification.type)}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-gray-900">${notification.title}</p>
          <p class="text-xs text-gray-500 mt-1">${notification.message}</p>
        </div>
        <button class="flex-shrink-0 text-gray-400 hover:text-gray-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
      toast.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 5000);
    
    // Handle close button
    const closeBtn = toast.querySelector('button');
    closeBtn?.addEventListener('click', () => {
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    });
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'top-4 right-4';
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      // Mock API call - replace with actual Supabase update
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, read: true }
            : notification
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      // Mock API call - replace with actual Supabase update
      setNotifications(prev => 
        prev.map(notification => ({ ...notification, read: true }))
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      // Mock API call - replace with actual Supabase delete
      setNotifications(prev => 
        prev.filter(notification => notification.id !== notificationId)
      );
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'game_request':
        return '<div class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center"><svg class="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path></svg></div>';
      case 'game_accepted':
        return '<div class="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center"><svg class="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>';
      case 'game_declined':
        return '<div class="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center"><svg class="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></div>';
      case 'game_reminder':
        return '<div class="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center"><svg class="w-3 h-3 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>';
      case 'booking_confirmation':
        return '<div class="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center"><svg class="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
      default:
        return '<div class="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center"><svg class="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>';
    }
  };

  const getNotificationIconComponent = (type: string) => {
    switch (type) {
      case 'game_request':
        return <Users className="w-4 h-4 text-blue-600" />;
      case 'game_accepted':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'game_declined':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'game_reminder':
        return <Clock className="w-4 h-4 text-orange-600" />;
      case 'booking_confirmation':
        return <Calendar className="w-4 h-4 text-purple-600" />;
      default:
        return <Info className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      {/* Notification Bell Button */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
            >
              <span className="text-xs text-white font-medium">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </motion.div>
          )}
        </Button>

        {/* Notification Dropdown */}
        <AnimatePresence>
          {isOpen && (
            <>
              <div
                className="fixed inset-0 z-[90]"
                onClick={() => setIsOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-sm sm:max-w-none bg-white rounded-lg shadow-xl border z-[100] max-h-96 overflow-hidden"
              >
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={markAllAsRead}
                          className="text-xs"
                        >
                          Mark all read
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsOpen(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader className="w-5 h-5 animate-spin text-emerald-600" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="text-center py-8 px-4">
                      <BellRing className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-gray-500 text-sm">No notifications yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {notifications.slice(0, maxVisible).map(notification => (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                            !notification.read ? 'bg-blue-50/50' : ''
                          }`}
                          onClick={() => {
                            markAsRead(notification.id);
                            onNotificationClick?.(notification);
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-1">
                              {getNotificationIconComponent(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'} text-gray-900`}>
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {notification.message}
                                  </p>
                                  {notification.metadata && (
                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                                      {notification.metadata.turfName && (
                                        <span className="flex items-center gap-1">
                                          <MapPin className="w-3 h-3" />
                                          {notification.metadata.turfName}
                                        </span>
                                      )}
                                      {notification.metadata.date && (
                                        <span className="flex items-center gap-1">
                                          <Clock className="w-3 h-3" />
                                          {notification.metadata.date} • {notification.metadata.time}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 ml-2">
                                  <span className="text-xs text-gray-400">
                                    {formatTimeAgo(notification.createdAt)}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteNotification(notification.id);
                                    }}
                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              {!notification.read && (
                                <div className="w-2 h-2 bg-blue-600 rounded-full mt-1"></div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {notifications.length > maxVisible && (
                  <div className="p-3 border-t border-gray-100 bg-gray-50">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => {
                        // Handle view all notifications
                        console.log('View all notifications');
                      }}
                    >
                      View all {notifications.length} notifications
                    </Button>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export default NotificationSystem;