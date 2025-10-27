import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, Check, X, User, Clock, MapPin, Users, 
  MessageCircle, AlertCircle, Loader, CheckCircle,
  XCircle, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../lib/toastManager';
import { gamesAPI } from '../lib/api';
import { gameRequestHelpers, userHelpers, supabase } from '../lib/supabase';

// Utility function to format time to 12-hour format for Indian users
const formatTo12Hour = (time24: string): string => {
  if (!time24) return time24;
  
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  
  return `${hour12}:${minutes} ${ampm}`;
};

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
  const [refreshing, setRefreshing] = useState(false);
  const [processingRequests, setProcessingRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadGameRequests();
    }
  }, [user]);

  const loadGameRequests = async () => {
    setLoading(true);
    try {
      console.log('🔍 GameRequestSystem: Loading game requests for user:', user?.id);
      
      // Get user's hosted games
      const myGames = await gamesAPI.getUserGames(user!.id);
      console.log('🎮 GameRequestSystem: My hosted games:', myGames);
      console.log('🔧 DEBUG: Starting to load requests for', myGames.data?.length || 0, 'games');
      
      if (myGames.success && myGames.data) {
        const allRequests: GameRequest[] = [];
        
        for (const game of myGames.data) {
          console.log('📋 GameRequestSystem: Checking requests for game:', game.id);
          const requests = await gameRequestHelpers.getGameRequests(game.id);
          
          if (requests.data && requests.data.length > 0) {
            console.log('✨ GameRequestSystem: Found requests for game', game.id, ':', requests.data);
            
            // Transform database requests to UI format with proper user data fetching
            const transformedRequests = await Promise.all(requests.data.map(async (req: any) => {
              console.log('🔍 Processing game request:', req);
              
              // Get user data from users table (much simpler and more reliable)
              let actualUserName = 'Game Player';
              let actualUserAvatar = '';
              let userData: any = null;
              
              if (req.user_id) {
                console.log('🔍 Fetching user data from users table for user_id:', req.user_id);
                
                try {
                  // First get user email from auth.users
                  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(req.user_id);
                  console.log('📧 Auth data for user lookup:', { authData: authData?.user?.email, authError });
                  
                  if (authData?.user?.email) {
                    // Now find user in users table by email
                    const { data: fetchedUserData, error: userError } = await supabase
                      .from('users')
                      .select('name, email, profile_image_url, phone')
                      .eq('email', authData.user.email)
                      .single();
                    
                    console.log('📊 Users table response by email:', { userData: fetchedUserData, userError });
                    
                    if (fetchedUserData && !userError) {
                      userData = fetchedUserData;
                      console.log('✅ Found user data from users table by email:', userData);
                      actualUserName = userData.name || userData.email?.split('@')[0] || 'Game Player';
                      actualUserAvatar = userData.profile_image_url || '';
                      
                      console.log('📝 Extracted user info:', { 
                        actualUserName, 
                        actualUserAvatar,
                        source: 'users_table_by_email'
                      });
                    } else {
                      console.log('⚠️ User not found in users table by email:', userError);
                      // Fallback: use auth data directly
                      actualUserName = authData.user.user_metadata?.name || 
                                      authData.user.user_metadata?.full_name || 
                                      authData.user.email?.split('@')[0] || 
                                      'Game Player';
                      actualUserAvatar = authData.user.user_metadata?.avatar_url || '';
                      console.log('📝 Using auth fallback data:', { actualUserName, actualUserAvatar });
                    }
                  } else {
                    console.log('⚠️ Could not get user email from auth.users');
                  }
                } catch (userErr) {
                  console.log('⚠️ Users table fetch exception:', userErr);
                }
              } else {
                console.log('⚠️ No user_id provided in request');
              }

              console.log('📝 Final user data:', { actualUserName, actualUserAvatar });

              const startTime12 = formatTo12Hour(game.start_time || '00:00');
              const endTime12 = formatTo12Hour(game.end_time || '00:00');

              const transformedRequest = {
                id: req.id,
                gameId: game.id,
                gameName: `${game.sport || 'Game'} at ${game.turfs?.name || game.turf_name || 'Unknown Turf'}`,
                turfName: game.turfs?.name || game.turf_name || 'Unknown Turf',
                turfAddress: game.turfs?.address || game.turf_address || 'Unknown Address',
                date: new Date(game.date).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                }),
                timeSlot: `${startTime12} - ${endTime12}`,
                requesterId: req.user_id,
                requesterName: actualUserName,
                requesterPhone: userData?.phone || req.requester_phone || '',
                requesterAvatar: actualUserAvatar,
                hostId: game.creator_id,
                status: req.status,
                message: req.message || 'Would like to join this game.',
                createdAt: req.created_at,
                skillLevel: req.skill_level || 'All levels',
                currentPlayers: game.current_players || 1,
                maxPlayers: game.max_players || 2
              };
              
              console.log('🔧 DEBUG: Transforming request:', {
                requestId: req.id,
                rawStatus: req.status,
                transformedStatus: transformedRequest.status,
                statusType: typeof req.status
              });
              
              return transformedRequest;
            }));
            
            allRequests.push(...transformedRequests);
          }
        }
        
        console.log('🎯 GameRequestSystem: Total requests found:', allRequests);
        console.log('🔧 DEBUG: Request statuses breakdown:');
        allRequests.forEach(req => {
          console.log(`  - ID: ${req.id}, Status: "${req.status}" (type: ${typeof req.status})`);
        });
        
        setRequests(allRequests);
      } else {
        console.log('📭 GameRequestSystem: No hosted games found or no requests');
        setRequests([]);
      }
    } catch (err: any) {
      console.error('❌ GameRequestSystem: Error loading game requests:', err);
      console.error('❌ GameRequestSystem: Error details:', {
        message: err?.message,
        stack: err?.stack,
        name: err?.name
      });
      // Always show error for debugging
      error('Failed to load game requests: ' + (err?.message || 'Unknown error'));
      // Set empty array so UI shows "no requests" instead of loading forever
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return; // Prevent double refresh
    
    setRefreshing(true);
    try {
      await loadGameRequests();
      success('Requests refreshed');
    } catch (err) {
      error('Failed to refresh requests');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRequestAction = async (requestId: string, action: 'accept' | 'decline') => {
    setProcessingRequests(prev => new Set(prev).add(requestId));
    
    try {
      console.log(`🎯 GameRequestSystem: ${action}ing request:`, requestId);
      console.log(`🔍 GameRequestSystem: Available requests:`, requests);
      console.log(`🔍 GameRequestSystem: Looking for request with ID:`, requestId);
      
      // Find the request to get the game ID
      const request = requests.find(req => {
        console.log(`🔍 Comparing req.id: "${req.id}" with requestId: "${requestId}"`);
        return req.id === requestId;
      });
      
      if (!request) {
        console.error(`❌ GameRequestSystem: Request not found! Available request IDs:`, requests.map(r => r.id));
        throw new Error(`Request not found. Available: ${requests.map(r => r.id).join(', ')}`);
      }
      
      console.log(`✅ GameRequestSystem: Found request:`, request);
      
      let response;
      if (action === 'accept') {
        response = await gameRequestHelpers.acceptGameRequest(requestId);
      } else {
        response = await gameRequestHelpers.rejectGameRequest(requestId);
      }
      
      if (response.success) {
        // Show success message first
        if (action === 'accept') {
          success('Request accepted! Player has been notified and added to the game.');
        } else {
          success('Request declined.');
        }
        
        // Reload all requests to get the latest status from the database
        // This ensures the UI reflects the true state and handles any backend updates
        await loadGameRequests();
        
        onRequestStatusChange?.(requestId, action === 'accept' ? 'accepted' : 'declined');
      } else {
        error(response.error || `Failed to ${action} request`);
      }
    } catch (err: any) {
      console.error(`❌ GameRequestSystem: Error ${action}ing request:`, err);
      error(err.message || `Failed to ${action} request`);
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
  
  // DEBUG: Log filtering results
  console.log('🔧 DEBUG: Filtering results:');
  console.log('  - Total requests:', requests.length);
  console.log('  - Pending requests:', pendingRequests.length, pendingRequests.map(r => ({ id: r.id, status: r.status })));
  console.log('  - Processed requests:', processedRequests.length, processedRequests.map(r => ({ id: r.id, status: r.status })));

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