import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, Check, X, User, Clock, MapPin, Users, 
  MessageCircle, AlertCircle, Loader, CheckCircle,
  XCircle, Calendar, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../lib/toastManager';
import { gameRequestHelpers } from '../lib/supabase';

// Utility function to format time to 12-hour format
const formatTo12Hour = (time24: string): string => {
  if (!time24) return time24;
  
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  
  return `${hour12}:${minutes} ${ampm}`;
};

export interface MyGameRequest {
  id: string;
  gameId: string;
  gameName: string;
  turfName: string;
  turfAddress: string;
  date: string;
  timeSlot: string;
  hostId: string;
  status: 'pending' | 'accepted' | 'declined';
  message?: string;
  createdAt: string;
  currentPlayers: number;
  maxPlayers: number;
}

export function MyGameRequests() {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [requests, setRequests] = useState<MyGameRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingRequests, setCancellingRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadMyRequests();
    }
  }, [user]);

  const loadMyRequests = async () => {
    setLoading(true);
    try {
      console.log('🔍 MyGameRequests: Loading requests for user:', user?.id);
      
      const response = await gameRequestHelpers.getMyRequests(user!.id);
      
      if (response.data) {
        const transformedRequests = response.data.map((req: any) => {
          const gameData = req.games;
          const startTime12 = formatTo12Hour(gameData?.start_time || '00:00');
          const endTime12 = formatTo12Hour(gameData?.end_time || '00:00');

          return {
            id: req.id,
            gameId: req.game_id,
            gameName: `${gameData?.sport || 'Game'} at ${gameData?.turfs?.name || gameData?.turf_name || 'Unknown Turf'}`,
            turfName: gameData?.turfs?.name || gameData?.turf_name || 'Unknown Turf',
            turfAddress: gameData?.turfs?.address || gameData?.turf_address || 'Unknown Address',
            date: gameData?.date ? new Date(gameData.date).toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            }) : 'Unknown Date',
            timeSlot: `${startTime12} - ${endTime12}`,
            hostId: gameData?.creator_id || '',
            status: req.status,
            message: req.message || req.note || 'Would like to join this game.',
            createdAt: req.created_at,
            currentPlayers: gameData?.current_players || 1,
            maxPlayers: gameData?.max_players || 2
          };
        });
        
        console.log('🎯 MyGameRequests: Transformed requests:', transformedRequests);
        setRequests(transformedRequests);
      } else {
        console.log('📭 MyGameRequests: No requests found');
        setRequests([]);
      }
    } catch (err: any) {
      console.error('❌ MyGameRequests: Error loading requests:', err);
      error('Failed to load your game requests: ' + (err?.message || 'Unknown error'));
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return; // Prevent double refresh
    
    setRefreshing(true);
    try {
      await loadMyRequests();
      success('Requests refreshed');
    } catch (err) {
      error('Failed to refresh requests');
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    setCancellingRequests(prev => new Set(prev).add(requestId));
    
    try {
      console.log('🔄 Cancelling request:', requestId);
      const response = await gameRequestHelpers.cancelMyRequest(requestId);
      
      if (response.success) {
        success('Request cancelled successfully');
        // Reload requests to reflect the change
        await loadMyRequests();
      } else {
        error(response.error || 'Failed to cancel request');
      }
    } catch (err: any) {
      console.error('❌ Error cancelling request:', err);
      error(err.message || 'Failed to cancel request');
    } finally {
      setCancellingRequests(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'declined':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-orange-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'declined':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-orange-50 text-orange-700 border-orange-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'Accepted';
      case 'declined':
        return 'Declined';
      default:
        return 'Pending';
    }
  };

  const pendingRequests = requests.filter(req => req.status === 'pending');
  const processedRequests = requests.filter(req => req.status !== 'pending');

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            My Game Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            My Game Requests
            {pendingRequests.length > 0 && (
              <Badge className="bg-orange-100 text-orange-700">
                {pendingRequests.length} pending
              </Badge>
            )}
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            variant="ghost"
            size="sm"
            className="p-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Send className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No game requests yet</p>
            <p className="text-sm">Start by requesting to join some games!</p>
          </div>
        ) : (
          <>
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  Pending Requests
                </h4>
                <AnimatePresence>
                  {pendingRequests.map(request => (
                    <motion.div
                      key={request.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-md transition-shadow"
                    >
                      {/* Request Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                            <Send className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <p className="font-medium">Request to join "{request.gameName}"</p>
                            <p className="text-sm text-gray-500">
                              Sent on {new Date(request.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(request.status)}>
                          {getStatusIcon(request.status)}
                          <span className="ml-1">{getStatusText(request.status)}</span>
                        </Badge>
                      </div>

                      {/* Game Details */}
                      <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {request.turfName}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {request.date} • {request.timeSlot}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {request.currentPlayers}/{request.maxPlayers} players
                          </div>
                        </div>
                      </div>

                      {/* Message */}
                      {request.message && (
                        <div className="bg-blue-50 border-l-4 border-blue-200 p-3 mb-3">
                          <div className="flex items-start gap-2">
                            <MessageCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-blue-800">{request.message}</p>
                          </div>
                        </div>
                      )}

                      {/* Cancel Button for pending requests */}
                      {request.status === 'pending' && (
                        <div className="flex justify-end">
                          <Button
                            onClick={() => handleCancelRequest(request.id)}
                            disabled={cancellingRequests.has(request.id)}
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                          >
                            {cancellingRequests.has(request.id) ? (
                              <Loader className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <X className="w-4 h-4 mr-2" />
                            )}
                            Cancel Request
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Processed Requests */}
            {processedRequests.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Recent Responses</h4>
                {processedRequests.slice(0, 5).map(request => (
                  <div
                    key={request.id}
                    className="border border-gray-100 rounded-lg p-3 bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {request.gameName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {request.date} • {request.timeSlot}
                        </p>
                      </div>
                      <Badge className={getStatusColor(request.status)} size="sm">
                        {getStatusIcon(request.status)}
                        <span className="ml-1">{getStatusText(request.status)}</span>
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}