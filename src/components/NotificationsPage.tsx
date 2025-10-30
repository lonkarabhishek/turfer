import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  Settings,
  GamepadIcon,
  Check,
  X as XIcon,
  Users,
  Calendar,
  MessageCircle,
  MoreHorizontal,
} from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { Button } from './ui/button';

interface NotificationsPageProps {
  onBack?: () => void;
  onGameNavigation?: (gameId: string) => void;
  onRequestsNavigation?: () => void;
}

export function NotificationsPage({ onBack, onGameNavigation, onRequestsNavigation }: NotificationsPageProps) {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const [activeTab, setActiveTab] = useState<'all' | 'requests'>('all');

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'game_request':
        return <GamepadIcon className="w-5 h-5 text-blue-500" />;
      case 'game_request_accepted':
        return <Check className="w-5 h-5 text-green-500" />;
      case 'game_request_rejected':
        return <XIcon className="w-5 h-5 text-red-500" />;
      case 'game_full':
        return <Users className="w-5 h-5 text-purple-500" />;
      case 'game_cancelled':
        return <XIcon className="w-5 h-5 text-orange-500" />;
      case 'new_player_joined':
        return <Users className="w-5 h-5 text-indigo-500" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const notifDate = new Date(dateString);
    const diffInMs = now.getTime() - notifDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInHours < 24) return `${diffInHours}h`;
    if (diffInDays < 7) return `${diffInDays}d`;
    return notifDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleNotificationClick = async (notification: any) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    // Handle navigation based on notification type
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
        if (onRequestsNavigation) {
          onRequestsNavigation();
        }
        break;
      default:
        // Fallback: try to navigate to game if gameId exists
        if (notification.metadata?.gameId && onGameNavigation) {
          onGameNavigation(notification.metadata.gameId);
        }
        break;
    }
  };

  const filteredNotifications = activeTab === 'all'
    ? notifications
    : notifications.filter(n =>
        n.type === 'game_request' ||
        n.type === 'game_request_accepted' ||
        n.type === 'game_request_rejected' ||
        n.type === 'new_player_joined'
      );

  return (
    <div className="min-h-screen bg-white">
      {/* Header - X/Twitter Style */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-8 flex-1">
            <button
              onClick={onBack}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors -ml-2"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-900" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-sm"
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 text-center py-4 text-[15px] font-medium relative transition-colors ${
              activeTab === 'all'
                ? 'text-gray-900'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            All
            {activeTab === 'all' && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-full"
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 text-center py-4 text-[15px] font-medium relative transition-colors ${
              activeTab === 'requests'
                ? 'text-gray-900'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            Requests
            {activeTab === 'requests' && (
              <motion.div
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-full"
              />
            )}
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
              <p className="text-sm text-gray-500">Loading notifications...</p>
            </div>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Nothing to see here — yet</h3>
            <p className="text-[15px] text-gray-500 text-center max-w-sm">
              {activeTab === 'all'
                ? 'When you get notifications, they\'ll show up here'
                : 'Game requests will appear here'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredNotifications.map((notification, index) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => handleNotificationClick(notification)}
                className={`px-4 py-3 cursor-pointer transition-all duration-200 hover:bg-gray-50 ${
                  !notification.is_read ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      !notification.is_read ? 'bg-blue-100 ring-2 ring-blue-200' : 'bg-gray-100'
                    }`}>
                      {getNotificationIcon(notification.type)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className={`text-[15px] leading-normal ${
                          !notification.is_read ? 'font-semibold text-gray-900' : 'text-gray-800'
                        }`}>
                          {notification.title}
                        </p>
                        <p className="text-[15px] text-gray-600 mt-0.5 leading-normal">
                          {notification.message}
                        </p>
                        <p className="text-[15px] text-gray-500 mt-1">
                          {formatTimeAgo(notification.created_at)}
                        </p>
                      </div>

                      {/* Unread indicator */}
                      {!notification.is_read && (
                        <div className="flex-shrink-0 mt-2">
                          <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse"></div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
