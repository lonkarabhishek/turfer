import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, X, Users, GamepadIcon, Calendar, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useNotifications } from '../hooks/useNotifications';

interface NotificationDropdownProps {
  className?: string;
  onGameNavigation?: (gameId: string) => void;
  onRequestsNavigation?: () => void;
}

export function NotificationDropdown({ className = '', onGameNavigation, onRequestsNavigation }: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, loadNotifications } = useNotifications();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'game_request':
      case 'game_request_accepted':
      case 'game_request_rejected':
        return <GamepadIcon className="w-4 h-4" />;
      case 'game_full':
      case 'game_cancelled':
        return <Calendar className="w-4 h-4" />;
      case 'new_player_joined':
        return <Users className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'game_request':
        return 'text-blue-600 bg-blue-50';
      case 'game_request_accepted':
        return 'text-green-600 bg-green-50';
      case 'game_request_rejected':
        return 'text-red-600 bg-red-50';
      case 'game_full':
        return 'text-purple-600 bg-purple-50';
      case 'new_player_joined':
        return 'text-indigo-600 bg-indigo-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const notifDate = new Date(dateString);
    const diffInMs = now.getTime() - notifDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return notifDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleNotificationClick = async (notification: any) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    setIsOpen(false);

    // Handle different notification types with navigation
    switch (notification.type) {
      case 'game_request_accepted':
      case 'game_request_rejected':
      case 'game_full':
      case 'game_cancelled':
      case 'new_player_joined':
        // For player notifications, navigate to the specific game
        if (notification.metadata?.gameId && onGameNavigation) {
          onGameNavigation(notification.metadata.gameId);
        }
        break;
      case 'game_request':
        // For host notifications about join requests, navigate to requests page
        // The requests page will show all pending requests for their games
        if (onRequestsNavigation) {
          onRequestsNavigation();
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className={`relative flex items-center ${className}`} ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-primary-50 rounded-full transition-all duration-200 hover:scale-105 flex items-center justify-center"
      >
        <Bell className={`w-5 h-5 transition-colors duration-200 ${unreadCount > 0 ? 'text-primary-600' : 'text-gray-600'} ${isOpen ? 'animate-pulse' : ''}`} />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-gradient-to-r from-red-500 to-pink-500 text-white border-2 border-white shadow-lg animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 max-h-96 overflow-hidden backdrop-blur-sm"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-purple-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                  <Bell className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-bold text-lg text-gray-900">Notifications</h3>
              </div>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    Mark all read
                  </Button>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-500">
                  <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full mx-auto mb-2"></div>
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p>No notifications yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    You'll see game requests and updates here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.slice(0, 10).map((notification, index) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`p-5 cursor-pointer hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50 transition-all duration-300 relative group border-l-4 ${
                        !notification.is_read 
                          ? 'bg-gradient-to-r from-blue-50/50 to-purple-50/30 border-l-blue-500 hover:shadow-md' 
                          : 'border-l-transparent hover:border-l-gray-300'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl ${getNotificationColor(notification.type)} shadow-sm group-hover:shadow-md transition-all duration-300 relative`}>
                          {getNotificationIcon(notification.type)}
                          {!notification.is_read && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-r from-red-500 to-pink-500 rounded-full animate-pulse"></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`font-semibold text-sm truncate group-hover:text-blue-900 transition-colors ${
                              !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {notification.title}
                            </h4>
                            {!notification.is_read && (
                              <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex-shrink-0 mt-1 animate-pulse"></div>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2 group-hover:text-gray-700 transition-colors">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between mt-3">
                            <p className="text-xs text-gray-400 group-hover:text-blue-600 transition-colors">
                              {formatTimeAgo(notification.created_at)}
                            </p>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-blue-600 font-medium">
                              Click to view →
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 10 && (
              <div className="p-3 border-t border-gray-100 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary-600 hover:text-primary-700"
                  onClick={() => {
                    setIsOpen(false);
                    // Navigate to full notifications page
                  }}
                >
                  View all notifications
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}