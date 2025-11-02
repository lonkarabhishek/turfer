import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Star, Clock, Users, Wifi, Car, WashingMachine,
  Coffee, Shield, Phone, ArrowLeft, ChevronLeft,
  ChevronRight, Plus, Heart, Share2, Calendar,
  CheckCircle, X, PlayCircle, Image as ImageIcon,
  MessageCircle, Award, Zap, Navigation, ThumbsUp,
  Camera, Video, DollarSign, Bookmark, ExternalLink,
  Gamepad2, Trophy, Target, Timer, Wifi as WifiIcon,
  ParkingCircle, Utensils, Shirt, Droplets, ShieldCheck,
  Sun, Moon, Verified, TrendingUp, Eye, Download, Map
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { turfsAPI, bookingsAPI, gamesAPI } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { TurfData } from './TurfCard';
import { GameCard, type GameData } from './GameCard';
import { generateTurfInquiryMessage, buildWhatsAppLink } from '../lib/whatsapp';
import { predictAvailability } from '../lib/availabilityPredictor';
import { filterNonExpiredGames } from '../lib/gameUtils';

// Convert Google Drive sharing link to direct image URL
const convertGoogleDriveUrl = (url: string): string => {
  if (!url) return '';

  // If it's already a direct link, return as is
  if (!url.includes('drive.google.com') && !url.includes('drive.usercontent.google.com')) return url;

  // Extract file ID from various Google Drive URL formats
  let fileId = '';

  // Format: https://drive.google.com/file/d/FILE_ID/view
  const match1 = url.match(/\/file\/d\/([^\/\?]+)/);
  if (match1) fileId = match1[1];

  // Format: https://drive.google.com/open?id=FILE_ID
  const match2 = url.match(/[?&]id=([^&]+)/);
  if (match2) fileId = match2[1];

  // Format: https://drive.google.com/uc?id=FILE_ID
  const match3 = url.match(/\/uc\?.*id=([^&]+)/);
  if (match3) fileId = match3[1];

  // Return direct image URL if we found a file ID
  // Using thumbnail format which works better for images
  if (fileId) {
    const convertedUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
    console.log('🔄 Google Drive URL converted:', { original: url, converted: convertedUrl, fileId });
    return convertedUrl;
  }

  console.log('❌ Could not extract file ID from:', url);
  // If no file ID found, return original URL
  return url;
};

interface TurfDetailPageEnhancedProps {
  turfId: string;
  onBack: () => void;
  onCreateGame?: () => void;
  onBookTurf?: () => void;
  onGameClick?: (gameId: string) => void;
}

interface TimeSlot {
  time: string;
  available: boolean;
  price: number;
  bookedBy?: string;
  isPopular?: boolean;
  discount?: number;
}

interface TurfAvailability {
  date: string;
  slots: TimeSlot[];
}

interface Review {
  id: string;
  user: {
    name: string;
    avatar?: string;
    rating: number;
  };
  rating: number;
  comment: string;
  date: string;
  verified: boolean;
  helpful: number;
}

const amenityIcons: Record<string, { icon: React.ComponentType<any>, label: string, color: string }> = {
  'parking': { icon: ParkingCircle, label: 'Free Parking', color: 'text-blue-600' },
  'wifi': { icon: WifiIcon, label: 'High-Speed WiFi', color: 'text-green-600' },
  'washroom': { icon: WashingMachine, label: 'Clean Washrooms', color: 'text-purple-600' },
  'canteen': { icon: Utensils, label: 'Food & Beverages', color: 'text-orange-600' },
  'security': { icon: ShieldCheck, label: '24/7 Security', color: 'text-red-600' },
  'changing_room': { icon: Shirt, label: 'Changing Rooms', color: 'text-teal-600' },
  'flood_lights': { icon: Zap, label: 'LED Flood Lights', color: 'text-yellow-600' },
  'drinking_water': { icon: Droplets, label: 'Drinking Water', color: 'text-cyan-600' },
  'first_aid': { icon: Plus, label: 'First Aid', color: 'text-pink-600' }
};

const sportIcons: Record<string, { icon: React.ComponentType<any>, color: string }> = {
  'Football': { icon: Target, color: 'text-green-600' },
  'Cricket': { icon: Trophy, color: 'text-blue-600' },
  'Basketball': { icon: Gamepad2, color: 'text-orange-600' },
  'Tennis': { icon: Award, color: 'text-purple-600' },
  'Badminton': { icon: Timer, color: 'text-red-600' }
};

export function TurfDetailPageEnhanced({
  turfId,
  onBack,
  onCreateGame,
  onBookTurf,
  onGameClick
}: TurfDetailPageEnhancedProps) {
  const { user } = useAuth();
  const [turf, setTurf] = useState<TurfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availability, setAvailability] = useState<TurfAvailability[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<GameData[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const availabilityPrediction = turf ? predictAvailability(turf.rating, turf.totalReviews) : null;
  const [activeTab, setActiveTab] = useState('overview');
  const [viewCount, setViewCount] = useState(0);

  useEffect(() => {
    loadTurfDetails();
    loadReviews();
    setViewCount(Math.floor(Math.random() * 500) + 100);
  }, [turfId]);

  const loadTurfDetails = async () => {
    setLoading(true);
    try {
      console.log('🔍 Loading turf with ID:', turfId);
      // First try to load from database
      const response = await turfsAPI.getById(turfId);
      console.log('📦 Turf API response:', response);

      if (response.success && response.data) {
        console.log('🏟️ Turf loaded:', {
          id: response.data.id,
          name: response.data.name,
          hasGmapLink: !!(response.data.gmap_embed_link || response.data['Gmap Embed link']),
          gmapLink: (response.data.gmap_embed_link || response.data['Gmap Embed link'])?.substring(0, 50) + '...',
          fullData: response.data
        });
        setTurf(response.data);
        loadUpcomingGames();
        generateMockAvailability();
      } else {
        console.error('❌ Turf not found in database:', turfId, 'Response:', response);
      }
    } catch (error) {
      console.error('💥 Error loading turf details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUpcomingGames = async () => {
    try {
      const response = await gamesAPI.getAvailable();
      console.log('🎮 Games API response:', {
        success: response.success,
        totalGames: response.data?.length || 0,
        turfId: turfId
      });

      if (response.success && response.data) {
        console.log('🎮 All games from API:', response.data);

        const turfGames = response.data
          .filter((game: any) => {
            // Check multiple ways the turf ID might be stored
            const gameTurfId = game.turfs?.id || game.turf_id || game.turfId;
            const gameTurfName = game.turfs?.name || game.turf_name || game.turfName;

            // Only match if we have a valid comparison (not undefined === undefined)
            const matchesTurfId = gameTurfId && turfId && gameTurfId === turfId;
            const matchesTurfName = gameTurfName && turf?.name && gameTurfName === turf.name;
            const matches = matchesTurfId || matchesTurfName;

            console.log('🔍 Checking game:', {
              gameId: game.id,
              gameTurfId,
              gameTurfName,
              targetTurfId: turfId,
              targetTurfName: turf?.name,
              matchesTurfId,
              matchesTurfName,
              matches: matches,
              fullGame: game
            });

            return matches;
          });

        console.log('🎮 Games matching turf ID/name:', {
          matchingGames: turfGames.length,
          games: turfGames
        });

        // More lenient filtering - only filter out truly invalid games
        const validGames = turfGames.filter((game: any) => {
          const isValid = !!(game.id && game.sport && game.date);
          console.log('✅ Game validity check:', {
            gameId: game.id,
            sport: game.sport,
            date: game.date,
            isValid: isValid
          });
          return isValid;
        });

        console.log('🎮 Valid games:', {
          count: validGames.length,
          games: validGames
        });

        const nonExpiredTurfGames = filterNonExpiredGames(validGames);
        console.log('🎮 Non-expired games:', {
          count: nonExpiredTurfGames.length,
          games: nonExpiredTurfGames
        });

        // Transform games to match GameCard interface and filter out current user's games
        const transformedGames = nonExpiredTurfGames
          .filter((game: any) => {
            // Filter out games created by the current user
            const gameCreatorId = game.creator_id || game.creatorId;
            const isOwnGame = user && gameCreatorId && user.id === gameCreatorId;
            console.log('🔍 Checking game ownership:', {
              gameId: game.id,
              gameCreatorId,
              currentUserId: user?.id,
              isOwnGame
            });
            return !isOwnGame;
          })
          .slice(0, 3)
          .map((game: any) => ({
            id: game.id,
            hostName: game.host_name || game.hostName || 'Host',
            hostAvatar: game.host_avatar || game.users?.profile_image_url,
            turfId: game.turf_id || game.turfs?.id || turfId,
            turfName: game.turfs?.name || turf?.name || 'Turf',
            turfAddress: game.turfs?.address || turf?.address || '',
            date: game.date,
            timeSlot: game.start_time ? game.start_time.slice(0, 5) : game.timeSlot || 'TBD',
            format: game.sport ? game.sport.charAt(0).toUpperCase() + game.sport.slice(1) : game.format || 'Game',
            skillLevel: game.skill_level || game.skillLevel || 'All levels',
            currentPlayers: game.current_players || game.currentPlayers || 0,
            maxPlayers: game.max_players || game.maxPlayers || 10,
            costPerPerson: game.cost_per_person || game.costPerPerson || 0,
            notes: game.notes,
            hostPhone: game.host_phone || game.users?.phone || '',
            distanceKm: game.distanceKm,
            isUrgent: game.is_urgent || game.isUrgent,
            createdAt: game.created_at || game.createdAt,
            creatorId: game.creator_id || game.creatorId
          }));

        console.log('🎯 Setting transformed games in state:', {
          count: transformedGames.length,
          games: transformedGames
        });

        setUpcomingGames(transformedGames);
      }
    } catch (error) {
      console.error('❌ Error loading games:', error);
    }
  };

  const loadReviews = async () => {
    try {
      // Try to load reviews from database
      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('turf_id', turfId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        // Transform database reviews to match our interface
        const transformedReviews = data.map((review: any) => ({
          id: review.id,
          user: {
            name: review.user_name || 'Anonymous',
            avatar: '',
            rating: review.rating
          },
          rating: review.rating,
          comment: review.comment || '',
          date: new Date(review.created_at).toLocaleDateString(),
          verified: true,
          helpful: 0
        }));
        setReviews(transformedReviews);
      } else {
        // No reviews yet
        setReviews([]);
      }
    } catch (error) {
      console.error('Error loading reviews:', error);
      setReviews([]);
    }
  };

  const generateMockAvailability = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const slots: TimeSlot[] = [];
      for (let hour = 6; hour <= 22; hour++) {
        const time = `${hour.toString().padStart(2, '0')}:00-${(hour + 1).toString().padStart(2, '0')}:00`;
        const isAvailable = Math.random() > 0.3;
        const isPopular = hour >= 18 && hour <= 21;
        const basePrice = isPopular ? 800 : 600;
        const weekendMultiplier = date.getDay() === 0 || date.getDay() === 6 ? 1.2 : 1;

        slots.push({
          time,
          available: isAvailable,
          price: Math.round(basePrice * weekendMultiplier),
          isPopular,
          discount: isPopular ? 0 : Math.random() > 0.8 ? 10 : 0
        });
      }

      dates.push({ date: dateStr, slots });
    }
    setAvailability(dates);
  };

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (turf?.images && Array.isArray(turf.images) && turf.images.length > 1) {
      const newIndex = (currentImageIndex + 1) % turf.images.length;
      console.log('📸 Next image:', newIndex, '/', turf.images.length);
      setCurrentImageIndex(newIndex);
    } else {
      console.log('📸 Cannot navigate: only', turf?.images?.length || 0, 'images');
    }
  };

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (turf?.images && Array.isArray(turf.images) && turf.images.length > 1) {
      const newIndex = (currentImageIndex - 1 + turf.images.length) % turf.images.length;
      console.log('📸 Previous image:', newIndex, '/', turf.images.length);
      setCurrentImageIndex(newIndex);
    } else {
      console.log('📸 Cannot navigate: only', turf?.images?.length || 0, 'images');
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/turf/${turfId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: turf?.name,
          text: `Check out ${turf?.name} on TapTurf`,
          url: shareUrl,
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(shareUrl);
    }
  };

  const formatTime = (time: string) => {
    const [start, end] = time.split('-');
    const formatHour = (hour: string) => {
      const h = parseInt(hour.split(':')[0]);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${h12}${ampm}`;
    };
    return `${formatHour(start)}-${formatHour(end)}`;
  };

  const getGoogleMapsUrl = (address: string, coords?: { lat: number; lng: number }) => {
    if (coords) {
      // Use coordinates for more accurate location
      return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
    } else {
      // Use address for search
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    }
  };

  const getGoogleMapsDirectionsUrl = (address: string, coords?: { lat: number; lng: number }) => {
    if (coords) {
      return `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
    } else {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading turf details...</p>
        </div>
      </div>
    );
  }

  if (!turf) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Turf not found</p>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section with Image Gallery */}
      <div className="relative h-[50vh] md:h-[60vh] bg-gray-900 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img
            key={currentImageIndex}
            src={(turf.images && Array.isArray(turf.images) && turf.images[currentImageIndex])
              ? convertGoogleDriveUrl(turf.images[currentImageIndex])
              : 'https://placehold.co/800x400/10b981/ffffff?text=Turf'}
            alt={turf.name}
            className="w-full h-full object-cover"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
          />
        </AnimatePresence>

        {/* Simple overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

        {/* Image Navigation */}
        {turf.images && Array.isArray(turf.images) && turf.images.length > 1 && (
          <>
            <button
              onClick={(e) => prevImage(e)}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-md hover:bg-white/30 active:bg-white/40 text-white border border-white/30 rounded-full w-12 h-12 flex items-center justify-center shadow-2xl z-20 cursor-pointer transition-all hover:scale-110 active:scale-95"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={(e) => nextImage(e)}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-md hover:bg-white/30 active:bg-white/40 text-white border border-white/30 rounded-full w-12 h-12 flex items-center justify-center shadow-2xl z-20 cursor-pointer transition-all hover:scale-110 active:scale-95"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Header Controls */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="bg-white/90 hover:bg-white text-gray-900 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>

          <div className="flex gap-2">
            <Button
              onClick={handleShare}
              variant="ghost"
              size="sm"
              className="bg-white/90 hover:bg-white text-gray-900 rounded-lg"
            >
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Image Counter */}
        {turf.images && Array.isArray(turf.images) && turf.images.length > 1 && (
          <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-lg text-sm">
            {currentImageIndex + 1} / {turf.images.length}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Turf Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 -mt-20 relative z-10 mb-6 border border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
            <div className="flex-1">
              {/* Title */}
              <div className="mb-4">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{turf.name}</h1>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-current" />
                    <span className="font-medium">{turf.rating}</span>
                    <span>({turf.totalReviews})</span>
                  </div>
                  {turf.distanceKm && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      <span>{turf.distanceKm.toFixed(1)} km away</span>
                    </div>
                  )}
                </div>
              </div>


              {/* Sports */}
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Sports Available</p>
                <div className="flex flex-wrap gap-2">
                  {turf.slots?.map((sport) => (
                    <span key={sport} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm font-medium">
                      {sport}
                    </span>
                  ))}
                </div>
              </div>

              {/* Pricing */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-sm text-emerald-700 font-medium mb-1">Starting from</p>
                <p className="text-2xl font-bold text-emerald-900">{turf.priceDisplay}/hour</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 lg:w-80">
              {/* WhatsApp Button */}
              <Button
                onClick={() => {
                  const message = generateTurfInquiryMessage(turf);
                  const phone = (turf.contact_info as any)?.phone ||
                                turf.contacts?.phone ||
                                turf.contacts?.whatsapp;

                  if (!phone) {
                    alert('Contact information not available for this venue.');
                    return;
                  }

                  const whatsappUrl = buildWhatsAppLink({ phone, text: message });
                  window.open(whatsappUrl, '_blank');
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg"
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                Book via WhatsApp
              </Button>

              {onCreateGame && (
                <Button
                  onClick={onCreateGame}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 rounded-lg"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Game
                </Button>
              )}

              {((turf.contact_info as any)?.phone || turf.contacts?.phone) && (
                <Button
                  variant="outline"
                  className="w-full border-2 border-gray-300 hover:bg-gray-50 font-medium py-3 rounded-lg"
                  onClick={() => {
                    const phoneNumber = (turf.contact_info as any)?.phone || turf.contacts?.phone;
                    window.open(`tel:${phoneNumber}`, '_self');
                  }}
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Call Owner
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-100 rounded-lg p-1 mb-4">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900 rounded-md font-medium"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="availability"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900 rounded-md font-medium"
            >
              Availability
            </TabsTrigger>
            <TabsTrigger
              value="games"
              className="data-[state=active]:bg-white data-[state=active]:text-gray-900 rounded-md font-medium"
            >
              Games
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Description */}
            {turf.description && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700">{turf.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Turf Dimensions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Turf Specifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Length</p>
                    <p className="font-medium">60 ft</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Width</p>
                    <p className="font-medium">40 ft</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Height</p>
                    <p className="font-medium">20 ft</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Grounds</p>
                    <p className="font-medium">1 Box</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pricing Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Pricing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Weekdays</p>
                    <p className="font-medium text-emerald-600">₹600/hour</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Weekends</p>
                    <p className="font-medium text-emerald-600">₹800/hour</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Facilities & Equipment */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Facilities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {turf.amenities?.map((amenity) => {
                    const amenityData = amenityIcons[amenity.toLowerCase().replace(' ', '_')] ||
                                       { icon: CheckCircle, label: amenity, color: 'text-gray-600' };
                    const AmenityIcon = amenityData.icon;

                    return (
                      <div key={amenity} className="flex items-center gap-2">
                        <AmenityIcon className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm text-gray-700">{amenityData.label}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm text-gray-700">Equipment Provided</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm text-gray-700">Good Net Condition</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm text-gray-700">Well-maintained Grass</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Operating Hours */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Operating Hours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Start Time</span>
                    <span className="font-medium">6:00 AM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">End Time</span>
                    <span className="font-medium">12:00 AM</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Owner Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Owner & Contact</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Owner Name</span>
                    <span className="font-medium">Contact via WhatsApp</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Booking Channel</span>
                    <span className="font-medium">WhatsApp / Call</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Location */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Location</CardTitle>
              </CardHeader>
                <CardContent className="p-6">
                  <div className="border-2 border-gray-200 rounded-2xl overflow-hidden shadow-lg">
                    {(() => {
                      const gmapValue = turf.gmap_embed_link || turf['Gmap Embed link'];

                      // Check if we have a valid embed link
                      if (gmapValue) {
                        let embedUrl = '';

                        // If it's already a valid Google Maps embed URL
                        if (gmapValue.trim().startsWith('https://www.google.com/maps/embed')) {
                          embedUrl = gmapValue.trim();
                        }
                        // If it's iframe HTML, extract the src
                        else if (gmapValue.includes('<iframe')) {
                          const srcMatch = gmapValue.match(/src=["']([^"']+)["']/);
                          if (srcMatch && srcMatch[1].includes('google.com/maps/embed')) {
                            embedUrl = srcMatch[1];
                          }
                        }

                        // If we have a valid embed URL, show iframe
                        if (embedUrl) {
                          return (
                            <div className="relative w-full h-96 bg-gray-100">
                              <iframe
                                src={embedUrl}
                                width="100%"
                                height="100%"
                                style={{ border: 0 }}
                                allowFullScreen
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                title={`Map of ${turf.name}`}
                                className="w-full h-full"
                              />
                            </div>
                          );
                        }
                      }

                      // Fallback: Show clickable map placeholder
                      return (
                        <a
                          href={getGoogleMapsUrl(turf.address, turf.coords)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block h-96 bg-gradient-to-br from-purple-100 to-pink-100 hover:from-purple-200 hover:to-pink-200 transition-colors"
                        >
                          <div className="h-full flex items-center justify-center">
                            <div className="text-center text-gray-700">
                              <div className="w-24 h-24 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                                <MapPin className="w-12 h-12 text-white" />
                              </div>
                              <p className="font-bold text-xl mb-2">{turf.name}</p>
                              <p className="text-base mb-4 px-4">{turf.address}</p>
                              <div className="inline-flex items-center gap-2 bg-purple-500 text-white px-6 py-3 rounded-xl font-semibold shadow-lg">
                                <Navigation className="w-5 h-5" />
                                <span>View on Google Maps</span>
                              </div>
                            </div>
                          </div>
                        </a>
                      );
                    })()}
                  </div>
                  {/* Address below map */}
                  <div className="mt-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-200">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-bold text-gray-900 mb-2">{turf.address}</p>
                        <a
                          href={getGoogleMapsUrl(turf.address, turf.coords)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-800 transition-colors font-semibold bg-white px-4 py-2 rounded-lg hover:shadow-md"
                        >
                          <Navigation className="w-4 h-4" />
                          <span>Get Directions</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                </CardContent>
            </Card>
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="space-y-6">
            <Card className="border-2 border-emerald-100">
              <CardContent className="pt-16 pb-16">
                <div className="max-w-md mx-auto text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", duration: 0.5 }}
                  >
                    <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Calendar className="w-12 h-12 text-emerald-600" />
                    </div>
                  </motion.div>

                  <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-2 text-lg mb-4">
                    Coming Soon
                  </Badge>

                  <h3 className="text-2xl font-bold text-gray-900 mb-3">
                    Live Availability Calendar
                  </h3>

                  <p className="text-gray-600 mb-8 leading-relaxed">
                    We're working on bringing you real-time slot availability and instant booking.
                    For now, please use WhatsApp to check availability and book your slot.
                  </p>

                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      onClick={() => {
                        const message = generateTurfInquiryMessage(turf);
                        const phone = (turf.contact_info as any)?.phone ||
                                      turf.contacts?.phone ||
                                      turf.contacts?.whatsapp;

                        if (phone) {
                          const whatsappUrl = buildWhatsAppLink({ phone, text: message });
                          window.open(whatsappUrl, '_blank');
                        }
                      }}
                      className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-semibold px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all"
                    >
                      <MessageCircle className="w-5 h-5 mr-2" />
                      Check Availability on WhatsApp
                    </Button>
                  </motion.div>

                  <div className="mt-8 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <p className="text-sm text-emerald-800">
                      <Zap className="w-4 h-4 inline mr-1" />
                      Quick response guaranteed within minutes!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Games Tab */}
          <TabsContent value="games" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-600" />
                  Upcoming Games at this Turf
                </CardTitle>
                <p className="text-gray-600">Join ongoing games or create your own</p>
              </CardHeader>
              <CardContent>
                {!user ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">Sign in to view games</h3>
                    <p className="text-gray-500 mb-6">Create an account or sign in to see and join games at this turf</p>
                  </div>
                ) : upcomingGames.length > 0 ? (
                  <div className="grid gap-4">
                    {upcomingGames.map((game) => (
                      <GameCard key={game.id} game={game} variant="compact" onGameClick={onGameClick} user={user} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Gamepad2 className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 mb-4">No upcoming games at this turf</p>
                    {onCreateGame && (
                      <Button onClick={onCreateGame} className="bg-emerald-600 hover:bg-emerald-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Game
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-emerald-600" />
                  Reviews & Ratings
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Rating Summary */}
                <div className="flex items-center gap-6 mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-emerald-600">{turf.rating}</div>
                    <div className="flex items-center gap-1 mb-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < Math.floor(turf.rating) ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
                        />
                      ))}
                    </div>
                    <div className="text-sm text-gray-600">{turf.totalReviews} reviews</div>
                  </div>

                  <div className="flex-1">
                    {[5, 4, 3, 2, 1].map((rating) => {
                      const count = Math.floor(Math.random() * 20) + 5;
                      const percentage = (count / turf.totalReviews) * 100;
                      return (
                        <div key={rating} className="flex items-center gap-2 mb-1">
                          <span className="text-sm w-8">{rating}★</span>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-yellow-500 h-2 rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600 w-8">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reviews List */}
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                            <span className="text-emerald-600 font-semibold">
                              {review.user.name.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{review.user.name}</h4>
                              {review.verified && (
                                <Badge variant="secondary" className="text-xs">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Verified
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`w-3 h-3 ${i < review.rating ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
                                  />
                                ))}
                              </div>
                              <span className="text-sm text-gray-500">{review.date}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="text-gray-700 mb-3">{review.comment}</p>

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <button className="flex items-center gap-1 hover:text-emerald-600">
                          <ThumbsUp className="w-4 h-4" />
                          Helpful ({review.helpful})
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Gallery Tab */}
          <TabsContent value="gallery" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5 text-emerald-600" />
                  Photo Gallery
                </CardTitle>
              </CardHeader>
              <CardContent>
                {turf.images && Array.isArray(turf.images) && turf.images.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {turf.images.map((image, index) => (
                      <motion.div
                        key={index}
                        whileHover={{ scale: 1.05 }}
                        className="relative aspect-square rounded-lg overflow-hidden cursor-pointer"
                        onClick={() => setCurrentImageIndex(index)}
                      >
                        <img
                          src={image || '/api/placeholder/300/300'}
                          alt={`${turf.name} ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Eye className="w-6 h-6 text-white opacity-0 hover:opacity-100 transition-opacity" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No images available for this turf</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

    </div>
  );
}