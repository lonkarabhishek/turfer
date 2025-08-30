import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, Check, X, User, Clock, MapPin, Users, 
  MessageCircle, AlertCircle, Loader, CheckCircle,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../lib/toastManager';

export interface GameRequest {
  id: string;
  gameId: string;
  gameName: string;
  turfName: string;
  turfAddress: string;
  date: string;
  timeSlot: string;
  requesterId: string;
  requesterName: string;
  requesterPhone?: string;
  requesterAvatar?: string;
  hostId: string;
  status: 'pending' | 'accepted' | 'declined';
  message?: string;
  createdAt: string;
  skillLevel?: string;
  currentPlayers: number;
  maxPlayers: number;
}

interface GameRequestSystemProps {
  onRequestStatusChange?: (requestId: string, status: 'accepted' | 'declined') => void;
}

export function GameRequestSystem({ onRequestStatusChange }: GameRequestSystemProps) {
  const { user } = useAuth();
  const { success, error } = useToast();
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadGameRequests();
    }
  }, [user]);

  const loadGameRequests = async () => {
    setLoading(true);
    try {
      // Mock data for now - replace with actual API call
      const mockRequests: GameRequest[] = [
        {
          id: '1',
          gameId: 'game-1',
          gameName: 'Evening Football Match',
          turfName: 'Green Field Arena',
          turfAddress: 'Nashik Road',
          date: '2024-01-20',
          timeSlot: '18:00-19:00',
          requesterId: 'user-2',
          requesterName: 'Rahul Sharma',
          requesterPhone: '+91 9876543210',
          requesterAvatar: '',
          hostId: user!.id,
          status: 'pending',
          message: 'Hi! I\'m a regular football player and would love to join this game. My skill level is intermediate.',
          createdAt: '2024-01-19T10:30:00Z',
          skillLevel: 'Intermediate',
          currentPlayers: 8,
          maxPlayers: 14
        },
        {
          id: '2',
          gameId: 'game-2',
          gameName: 'Cricket Practice Session',
          turfName: 'Sports Complex',
          turfAddress: 'College Road',
          date: '2024-01-21',
          timeSlot: '16:00-18:00',
          requesterId: 'user-3',
          requesterName: 'Amit Patel',
          requesterPhone: '+91 8765432109',
          requesterAvatar: '',
          hostId: user!.id,
          status: 'pending',
          message: 'Looking forward to playing cricket with you all!',
          createdAt: '2024-01-19T14:15:00Z',
          skillLevel: 'Beginner',
          currentPlayers: 12,
          maxPlayers: 16
        }
      ];
      
      setRequests(mockRequests.filter(req => req.hostId === user!.id));
    } catch (err) {
      console.error('Error loading game requests:', err);
      error('Failed to load game requests');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestAction = async (requestId: string, action: 'accept' | 'decline') => {
    setProcessingRequests(prev => new Set(prev).add(requestId));
    
    try {
      // Mock API call - replace with actual implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const updatedRequests = requests.map(req => 
        req.id === requestId 
          ? { ...req, status: (action === 'accept' ? 'accepted' : 'declined') as 'accepted' | 'declined' }
          : req
      );
      
      setRequests(updatedRequests);
      onRequestStatusChange?.(requestId, action === 'accept' ? 'accepted' : 'declined');
      
      if (action === 'accept') {
        success('Request accepted! Player will be notified.');
      } else {
        success('Request declined.');
      }
    } catch (err) {
      console.error(`Error ${action}ing request:`, err);
      error(`Failed to ${action} request`);
    } finally {
      setProcessingRequests(prev => {
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

  const pendingRequests = requests.filter(req => req.status === 'pending');
  const processedRequests = requests.filter(req => req.status !== 'pending');

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Game Requests
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
            <Bell className="w-5 h-5" />
            Game Requests
            {pendingRequests.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700">
                {pendingRequests.length} pending
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Bell className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No game requests yet</p>
            <p className="text-sm">Requests will appear here when players want to join your games</p>
          </div>
        ) : (
          <>
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
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
                          {request.requesterAvatar ? (
                            <img
                              src={request.requesterAvatar}
                              alt={request.requesterName}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                              <span className="text-emerald-600 font-semibold">
                                {request.requesterName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="font-medium">{request.requesterName}</p>
                            <p className="text-sm text-gray-500">
                              wants to join "{request.gameName}"
                            </p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(request.status)}>
                          {getStatusIcon(request.status)}
                          <span className="ml-1 capitalize">{request.status}</span>
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
                            <Clock className="w-4 h-4" />
                            {request.date} • {request.timeSlot}
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {request.currentPlayers}/{request.maxPlayers} players
                          </div>
                        </div>
                        {request.skillLevel && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500">Skill Level:</span>
                            <Badge variant="outline" className="text-xs">
                              {request.skillLevel}
                            </Badge>
                          </div>
                        )}
                      </div>

                      {/* Message */}
                      {request.message && (
                        <div className="bg-blue-50 border-l-4 border-blue-200 p-3 mb-4">
                          <div className="flex items-start gap-2">
                            <MessageCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-blue-800">{request.message}</p>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleRequestAction(request.id, 'accept')}
                          disabled={processingRequests.has(request.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          {processingRequests.has(request.id) ? (
                            <Loader className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <Check className="w-4 h-4 mr-2" />
                          )}
                          Accept
                        </Button>
                        <Button
                          onClick={() => handleRequestAction(request.id, 'decline')}
                          disabled={processingRequests.has(request.id)}
                          variant="outline"
                          className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                        >
                          {processingRequests.has(request.id) ? (
                            <Loader className="w-4 h-4 animate-spin mr-2" />
                          ) : (
                            <X className="w-4 h-4 mr-2" />
                          )}
                          Decline
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Processed Requests */}
            {processedRequests.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Recent Activity</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {processedRequests.slice(0, 5).map(request => (
                    <div key={request.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-600">
                              {request.requesterName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium">{request.requesterName}</p>
                            <p className="text-xs text-gray-500">{request.gameName}</p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(request.status)}>
                          {getStatusIcon(request.status)}
                          <span className="ml-1 capitalize">{request.status}</span>
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default GameRequestSystem;