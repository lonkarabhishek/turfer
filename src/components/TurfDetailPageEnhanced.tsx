import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Star, Users, Wifi, Car, WashingMachine,
  Coffee, Shield, ArrowLeft, ChevronLeft,
  ChevronRight, Heart, Share2, Calendar,
  CheckCircle, X, Image as ImageIcon, Phone, MessageSquare
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { turfsAPI, bookingsAPI, gamesAPI } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import type { TurfData } from './TurfCard';
import { GameCard, type GameData } from './GameCard';
import { convertImageUrls } from '../lib/imageUtils';
import { formatStartingPrice } from '../lib/priceUtils';

interface TurfDetailPageProps {
  turfId: string;
  onBack: () => void;
  onCreateGame?: () => void;
  onGameClick?: (gameId: string) => void;
}

interface TimeSlot {
  time: string;
  available: boolean;
  price: number;
  bookedBy?: string;
}

interface TurfAvailability {
  date: string;
  slots: TimeSlot[];
}

const amenityIcons: Record<string, { icon: React.ComponentType<any>, label: string }> = {
  'parking': { icon: Car, label: 'Parking' },
  'wifi': { icon: Wifi, label: 'Free WiFi' },
  'washroom': { icon: WashingMachine, label: 'Washroom' },
  'canteen': { icon: Coffee, label: 'Canteen' },
  'security': { icon: Shield, label: '24/7 Security' },
  'changing_room': { icon: Users, label: 'Changing Room' }
};

// Utility function to convert 24-hour time to 12-hour AM/PM format
const formatTo12Hour = (time24: string): string => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12; // Convert 0 to 12 for midnight
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const timeSlots = [
  '05:00-06:00', '06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00',
  '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00', '14:00-15:00',
  '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00',
  '20:00-21:00', '21:00-22:00'
];

export function TurfDetailPageEnhanced({ turfId, onBack, onCreateGame, onGameClick }: TurfDetailPageProps) {
  const { isAuthenticated, user } = useAuth();
  const [turf, setTurf] = useState<TurfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availability, setAvailability] = useState<TurfAvailability[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [booking, setBooking] = useState(false);
  const [turfGames, setTurfGames] = useState<GameData[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);

  useEffect(() => {
    loadTurf();
    loadAvailability();
  }, [turfId]);

  useEffect(() => {
    if (turf?.name) {
      loadTurfGames();
    }
  }, [turf?.name]);

  const loadTurf = async () => {
    try {
      const response = await turfsAPI.getById(turfId);
      if (response.success && response.data) {
        console.log('🏟️ FULL TURF DATA RECEIVED:', response.data);
        console.log('🏟️ Available fields:', Object.keys(response.data));
        console.log('🏟️ Description:', (response.data as any).description);
        console.log('🏟️ Morning Price:', (response.data as any).morning_price);
        console.log('🏟️ Length:', (response.data as any).length_feet);
        console.log('🏟️ Start Time:', (response.data as any).start_time);
        console.log('🏟️ Owner Name:', (response.data as any).owner_name);
        setTurf(response.data as TurfData);
      }
    } catch (error) {
      console.error('Error loading turf:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async () => {
    const mockAvailability = [
      {
        date: new Date().toISOString().split('T')[0],
        slots: timeSlots.map(time => ({
          time,
          available: Math.random() > 0.3,
          price: 100 + Math.floor(Math.random() * 50)
        }))
      }
    ];
    setAvailability(mockAvailability);
  };

  const loadTurfGames = async () => {
    setLoadingGames(true);
    try {
      const response = await gamesAPI.getAvailable();
      if (response.success && response.data) {
        console.log('🎮 All available games:', response.data);
        console.log('🏟️ Current turf ID:', turfId);
        console.log('🏟️ Current turf name:', turf?.name);

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes

        const turfGames = response.data.filter((game: any) => {
          const gameTurfId = game.turf_id || game.turfId || '';
          const gameDate = game.date;
          const gameStartTime = game.start_time || game.startTime || "00:00";

          console.log(`🔍 Checking game ${game.id}: turf_id=${gameTurfId}, date=${gameDate}`);

          // Only include games at this turf - use ID comparison instead of name
          if (gameTurfId !== turfId) {
            console.log(`  ❌ Skipping - wrong turf (${gameTurfId} !== ${turfId})`);
            return false;
          }

          // Only include upcoming games (future dates or today's future games)
          if (gameDate > today) {
            console.log(`  ✅ Including - future date`);
            return true; // Future date
          } else if (gameDate === today) {
            // Same day - check if game hasn't started yet
            const [hours, minutes] = gameStartTime.split(':').map(Number);
            const gameTime = hours * 60 + minutes;
            const isUpcoming = gameTime > currentTime;
            console.log(`  ${isUpcoming ? '✅' : '❌'} Game time ${gameTime} vs current ${currentTime}`);
            return isUpcoming;
          }
          console.log(`  ❌ Skipping - past game`);
          return false; // Past game
        }).map((game: any) => {
          const hostName = game.users?.name || game.host_name || game.hostName || "Unknown Host";
          const hostPhone = game.users?.phone || game.host_phone || game.hostPhone || "9999999999";
          const turfName = game.turfs?.name || game.turf_name || game.turfName || "Unknown Turf";
          const turfAddress = game.turfs?.address || game.turf_address || game.turfAddress || "Unknown Address";
          const startTime = game.start_time || game.startTime || "00:00";
          const endTime = game.end_time || game.endTime || "00:00";

          return {
            id: game.id,
            hostName: hostName,
            hostAvatar: game.users?.profile_image_url || game.host_profile_image_url || game.host_avatar || game.hostAvatar || "",
            turfName: turfName,
            turfAddress: turfAddress,
            date: game.date,
            timeSlot: `${startTime}-${endTime}`,
            format: game.sport || game.format || "Game",
            skillLevel: game.skill_level || game.skillLevel || 'All levels',
            currentPlayers: game.current_players || game.currentPlayers || 1,
            maxPlayers: game.max_players || game.maxPlayers || 2,
            costPerPerson: game.price_per_player || game.cost_per_person || game.costPerPerson || 0,
            notes: game.notes,
            hostPhone: hostPhone,
            distanceKm: undefined,
            isUrgent: false,
            createdAt: game.created_at || game.createdAt || new Date().toISOString()
          };
        });
        setTurfGames(turfGames);
      } else {
        setTurfGames([]);
      }
    } catch (error) {
      console.error('Error loading turf games:', error);
      setTurfGames([]);
    } finally {
      setLoadingGames(false);
    }
  };

  const handleBookSlot = async (slot: TimeSlot) => {
    if (!isAuthenticated) {
      alert('Please sign in to book slots');
      return;
    }

    setBooking(true);
    try {
      console.log('Booking slot:', slot);
    } catch (error) {
      console.error('Booking error:', error);
    } finally {
      setBooking(false);
    }
  };

  const nextImage = () => {
    if (turf?.images.length) {
      setCurrentImageIndex((prev) => (prev + 1) % turf.images.length);
    }
  };

  const prevImage = () => {
    if (turf?.images.length) {
      setCurrentImageIndex((prev) => (prev - 1 + turf.images.length) % turf.images.length);
    }
  };

  const validImages = convertImageUrls(turf?.images || []);
  const hasMultipleImages = validImages.length > 1;

  // Debug: Log image data
  console.log('🖼️ IMAGE DEBUG:', {
    rawImages: turf?.images,
    validImages,
    hasMultipleImages,
    imageCount: validImages.length
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!turf) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <div className="text-6xl">🏟️</div>
          <div className="text-xl font-semibold text-gray-900">Turf not found</div>
          <Button onClick={onBack} variant="outline" className="rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // No mock reviews - show real reviews only
  const mockReviews: any[] = [];

  return (
    <div className="min-h-screen bg-white">
      {/* Minimalist Header */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <Button
              onClick={onBack}
              variant="ghost"
              size="sm"
              className="rounded-full hover:bg-gray-100 px-2 sm:px-3"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsLiked(!isLiked)}
                className="rounded-full hover:bg-gray-100 px-2 sm:px-3"
              >
                <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
                <span className="hidden sm:inline sm:ml-2">Save</span>
              </Button>
              <Button variant="ghost" size="sm" className="rounded-full hover:bg-gray-100 px-2 sm:px-3">
                <Share2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                <span className="hidden sm:inline sm:ml-2">Share</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Title Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-6"
        >
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2">{turf.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-gray-900 text-gray-900" />
              <span className="font-medium">{Number(turf.rating).toFixed(2)}</span>
              <span className="text-gray-600">({turf.totalReviews} reviews)</span>
            </div>
            <span className="text-gray-400">·</span>
            <button
              className="underline text-gray-900 hover:text-gray-700"
              onClick={() => {
                const mapsUrl = turf.coords
                  ? `https://maps.google.com/maps?q=${turf.coords.lat},${turf.coords.lng}&z=15`
                  : `https://maps.google.com/maps/dir//${encodeURIComponent(turf.address)}`;
                window.open(mapsUrl, '_blank');
              }}
            >
              {turf.address}
            </button>
          </div>
        </motion.div>

        {/* Image Grid - Airbnb Style */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 sm:mb-12"
        >
          {validImages.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 rounded-xl overflow-hidden h-[50vh] sm:h-[60vh] cursor-pointer"
              onClick={() => setShowImageGallery(true)}
            >
              {/* Main image */}
              <div className="col-span-4 sm:col-span-2 sm:row-span-2 relative group">
                <img
                  src={validImages[0]}
                  alt={turf.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    console.error('❌ Main image failed to load:', validImages[0]);
                    console.error('Error event:', e);
                  }}
                  onLoad={() => console.log('✅ Main image loaded:', validImages[0])}
                />
              </div>

              {/* Side images */}
              {validImages.slice(1, 5).map((img, idx) => (
                <div key={idx} className="hidden sm:block col-span-2 sm:col-span-1 relative group">
                  <img
                    src={img}
                    alt={`${turf.name} ${idx + 2}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      console.error(`❌ Side image ${idx + 2} failed to load:`, img);
                      console.error('Error event:', e);
                    }}
                    onLoad={() => console.log(`✅ Side image ${idx + 2} loaded:`, img)}
                  />
                  {idx === 3 && validImages.length > 5 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-medium">
                      <ImageIcon className="w-5 h-5 mr-2" />
                      Show all {validImages.length} photos
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[50vh] sm:h-[60vh] rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-6xl sm:text-8xl mb-4 opacity-80">🏟️</div>
                <div className="text-2xl sm:text-3xl font-bold">{turf.name}</div>
              </div>
            </div>
          )}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
          {/* Sticky Sidebar - Shows first on mobile, right side on desktop */}
          <div className="lg:col-span-1 lg:order-2">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:sticky lg:top-24"
            >
              <Card className="border border-gray-300 rounded-xl shadow-xl">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-2xl font-semibold text-gray-900">
                        {formatStartingPrice(turf)}
                      </span>
                      <span className="text-gray-600">per hour</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm">
                      <Star className="w-4 h-4 fill-gray-900 text-gray-900" />
                      <span className="font-medium">{Number(turf.rating).toFixed(1)}</span>
                      <span className="text-gray-600">· {turf.totalReviews} reviews</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-6 text-base font-semibold shadow-md transition-all duration-200"
                      onClick={() => {
                        // Get owner phone or contact phone
                        const phone = (turf as any).owner_phone || turf.contacts?.phone || (turf as any).contact_info?.phone;
                        if (phone) {
                          const message = encodeURIComponent(`Hi! I'm interested in booking ${turf.name}. Can you help me check availability?`);
                          window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${message}`, '_blank');
                        }
                      }}
                    >
                      Check availability
                    </Button>
                  </div>

                  <div className="pt-4 border-t border-gray-200 space-y-2 text-center text-sm text-gray-600">
                    <p>You won't be charged yet</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 lg:order-1 space-y-8">
            {/* Quick Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="pb-8 border-b border-gray-200"
            >
              <h2 className="text-xl sm:text-2xl font-semibold mb-4">What this place offers</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {turf.amenities?.filter(amenity => amenity && typeof amenity === 'string').map((amenity) => {
                  const amenityData = amenityIcons[amenity.toLowerCase().replace(/\s+/g, '_')];
                  const IconComponent = amenityData?.icon;

                  return (
                    <div key={amenity} className="flex items-center gap-3">
                      {IconComponent ? (
                        <IconComponent className="w-6 h-6 text-gray-700" />
                      ) : (
                        <CheckCircle className="w-6 h-6 text-gray-700" />
                      )}
                      <span className="text-gray-900">{amenityData?.label || amenity}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Description Section */}
            {(turf as any).description && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="pb-8 border-b border-gray-200"
              >
                <h2 className="text-xl sm:text-2xl font-semibold mb-4">About this turf</h2>
                <p className="text-gray-700 leading-relaxed">{(turf as any).description}</p>
              </motion.div>
            )}

            {/* Turf Details */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26 }}
              className="pb-8 border-b border-gray-200"
            >
              <h2 className="text-xl sm:text-2xl font-semibold mb-6">Turf Details</h2>
              <div className="grid sm:grid-cols-2 gap-6">
                {/* Dimensions */}
                {((turf as any).length_feet || (turf as any).width_feet || (turf as any).height_feet) && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Dimensions</h3>
                    <div className="space-y-2">
                      {(turf as any).length_feet && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                          <span className="text-gray-600">Length</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{(turf as any).length_feet}ft</span>
                            {(turf as any).length_feet > 105 ? (
                              <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">Excellent</span>
                            ) : (turf as any).length_feet >= 100 ? (
                              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">Good</span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded">Compact</span>
                            )}
                          </div>
                        </div>
                      )}
                      {(turf as any).width_feet && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                          <span className="text-gray-600">Width</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{(turf as any).width_feet}ft</span>
                            {(turf as any).width_feet > 50 ? (
                              <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">Excellent</span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">Standard</span>
                            )}
                          </div>
                        </div>
                      )}
                      {(turf as any).height_feet && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                          <span className="text-gray-600">Height</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{(turf as any).height_feet}ft</span>
                            {(turf as any).height_feet > 25 ? (
                              <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">Excellent</span>
                            ) : (turf as any).height_feet >= 20 ? (
                              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">Fair</span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">Poor</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Operating Hours */}
                {((turf as any).start_time || (turf as any).end_time) && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Operating Hours</h3>
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-blue-600" />
                        <span className="font-semibold text-blue-900">
                          {(turf as any).start_time && (turf as any).end_time
                            ? `${formatTo12Hour((turf as any).start_time)} - ${formatTo12Hour((turf as any).end_time)}`
                            : formatTo12Hour((turf as any).start_time || (turf as any).end_time)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Number of Grounds */}
                {(turf as any).number_of_grounds && (turf as any).number_of_grounds > 1 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Capacity</h3>
                    <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-purple-600" />
                        <span className="font-semibold text-purple-900">
                          {(turf as any).number_of_grounds} grounds available
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Grass Condition */}
                {(turf as any).grass_condition && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Grass Condition</h3>
                    <div className={`p-3 rounded-lg border ${
                      (turf as any).grass_condition.toLowerCase() === 'excellent' ? 'bg-emerald-50 border-emerald-100' :
                      (turf as any).grass_condition.toLowerCase() === 'good' ? 'bg-green-50 border-green-100' :
                      (turf as any).grass_condition.toLowerCase() === 'fair' ? 'bg-yellow-50 border-yellow-100' :
                      'bg-orange-50 border-orange-100'
                    }`}>
                      <span className={`font-semibold capitalize ${
                        (turf as any).grass_condition.toLowerCase() === 'excellent' ? 'text-emerald-700' :
                        (turf as any).grass_condition.toLowerCase() === 'good' ? 'text-green-700' :
                        (turf as any).grass_condition.toLowerCase() === 'fair' ? 'text-yellow-700' :
                        'text-orange-700'
                      }`}>
                        {(turf as any).grass_condition}
                      </span>
                    </div>
                  </div>
                )}

                {/* Net Condition */}
                {(turf as any).net_condition && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Net Condition</h3>
                    <div className={`p-3 rounded-lg border ${
                      (turf as any).net_condition.toLowerCase() === 'excellent' ? 'bg-emerald-50 border-emerald-100' :
                      (turf as any).net_condition.toLowerCase() === 'good' ? 'bg-green-50 border-green-100' :
                      (turf as any).net_condition.toLowerCase() === 'fair' ? 'bg-yellow-50 border-yellow-100' :
                      'bg-orange-50 border-orange-100'
                    }`}>
                      <span className={`font-semibold capitalize ${
                        (turf as any).net_condition.toLowerCase() === 'excellent' ? 'text-emerald-700' :
                        (turf as any).net_condition.toLowerCase() === 'good' ? 'text-green-700' :
                        (turf as any).net_condition.toLowerCase() === 'fair' ? 'text-yellow-700' :
                        'text-orange-700'
                      }`}>
                        {(turf as any).net_condition}
                      </span>
                    </div>
                  </div>
                )}

                {/* Nearby Landmark */}
                {(turf as any).nearby_landmark && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Nearby Landmark</h3>
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-gray-600" />
                        <span className="font-medium text-gray-900">{(turf as any).nearby_landmark}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Pricing Details */}
            {((turf as any).morning_price || (turf as any).afternoon_price || (turf as any).evening_price) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.27 }}
                className="pb-8 border-b border-gray-200"
              >
                <h2 className="text-xl sm:text-2xl font-semibold mb-4">Pricing</h2>
                <div className="space-y-4">
                  {/* Weekday Pricing */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Weekday Rates</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {(turf as any).morning_price && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-sm text-gray-600">Morning</div>
                          <div className="text-lg font-semibold text-gray-900">₹{(turf as any).morning_price}</div>
                        </div>
                      )}
                      {(turf as any).afternoon_price && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-sm text-gray-600">Afternoon</div>
                          <div className="text-lg font-semibold text-gray-900">₹{(turf as any).afternoon_price}</div>
                        </div>
                      )}
                      {(turf as any).evening_price && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-sm text-gray-600">Evening</div>
                          <div className="text-lg font-semibold text-gray-900">₹{(turf as any).evening_price}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Weekend Pricing */}
                  {((turf as any).weekend_morning_price || (turf as any).weekend_afternoon_price || (turf as any).weekend_evening_price) && (
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-2">Weekend Rates</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {(turf as any).weekend_morning_price && (
                          <div className="p-3 bg-emerald-50 rounded-lg">
                            <div className="text-sm text-emerald-600">Morning</div>
                            <div className="text-lg font-semibold text-emerald-900">₹{(turf as any).weekend_morning_price}</div>
                          </div>
                        )}
                        {(turf as any).weekend_afternoon_price && (
                          <div className="p-3 bg-emerald-50 rounded-lg">
                            <div className="text-sm text-emerald-600">Afternoon</div>
                            <div className="text-lg font-semibold text-emerald-900">₹{(turf as any).weekend_afternoon_price}</div>
                          </div>
                        )}
                        {(turf as any).weekend_evening_price && (
                          <div className="p-3 bg-emerald-50 rounded-lg">
                            <div className="text-sm text-emerald-600">Evening</div>
                            <div className="text-lg font-semibold text-emerald-900">₹{(turf as any).weekend_evening_price}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Unique Features */}
            {(turf as any).unique_features && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
                className="pb-8 border-b border-gray-200"
              >
                <h2 className="text-xl sm:text-2xl font-semibold mb-4">Unique Features</h2>
                <p className="text-gray-700 leading-relaxed">{(turf as any).unique_features}</p>
              </motion.div>
            )}

            {/* Owner Information */}
            {((turf as any).owner_name || (turf as any).owner_phone) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.29 }}
                className="pb-8 border-b border-gray-200"
              >
                <h2 className="text-xl sm:text-2xl font-semibold mb-4">Contact Information</h2>
                <div className="space-y-3">
                  {(turf as any).owner_name && (
                    <div className="flex items-center gap-3">
                      <Users className="w-5 h-5 text-gray-600" />
                      <span className="text-gray-900">{(turf as any).owner_name}</span>
                    </div>
                  )}
                  {(turf as any).owner_phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-gray-600" />
                      <a href={`tel:${(turf as any).owner_phone}`} className="text-emerald-600 hover:text-emerald-700 font-medium">
                        {(turf as any).owner_phone}
                      </a>
                    </div>
                  )}
                  {(turf as any).preferred_booking_channel && (
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-gray-600" />
                      <span className="text-gray-700 capitalize">Preferred: {(turf as any).preferred_booking_channel}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Reviews Section - Coming Soon */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="pb-8 border-b border-gray-200"
            >
              <div className="flex items-center gap-2 mb-6">
                <Star className="w-6 h-6 fill-gray-900 text-gray-900" />
                <h2 className="text-xl sm:text-2xl font-semibold">
                  {Number(turf.rating).toFixed(2)} · {turf.totalReviews} reviews
                </h2>
              </div>

              <div className="text-center py-12 bg-gray-50 rounded-xl">
                <Star className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Reviews Coming Soon</h3>
                <p className="text-gray-600">We're working on bringing you authentic reviews from verified players.</p>
              </div>
            </motion.div>

            {/* Upcoming Games */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="pb-8"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold">Upcoming Games</h2>
                  <p className="text-sm text-gray-600 mt-1">Join games scheduled at this turf</p>
                </div>
                {turfGames.length > 0 && (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
                    {turfGames.length} {turfGames.length === 1 ? 'game' : 'games'} available
                  </span>
                )}
              </div>

              {turfGames.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  {turfGames.slice(0, 4).map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      user={user}
                      hideTurfDetails={true}
                      onGameClick={onGameClick}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Upcoming Games</h3>
                  <p className="text-gray-600 mb-4">Be the first to create a game at this turf!</p>
                  {onCreateGame && (
                    <Button
                      onClick={onCreateGame}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6"
                    >
                      Create Game
                    </Button>
                  )}
                </div>
              )}
            </motion.div>

            {/* Available Time Slots - Coming Soon */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="pb-8"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold">Available Time Slots</h2>
                  <p className="text-sm text-gray-600 mt-1">Book specific time slots directly</p>
                </div>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                  Coming Soon
                </span>
              </div>

              <div className="text-center py-12 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-dashed border-blue-200">
                <Calendar className="w-12 h-12 mx-auto text-blue-400 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Slot Booking Coming Soon</h3>
                <p className="text-gray-600 mb-4">
                  Direct slot booking feature is being developed. For now, you can join existing games or create a new one!
                </p>
                {onCreateGame && (
                  <Button
                    onClick={onCreateGame}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-6"
                  >
                    Create Game Instead
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Image Gallery Modal */}
      <AnimatePresence>
        {showImageGallery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white flex items-center justify-center"
            onClick={() => setShowImageGallery(false)}
          >
            <button
              onClick={() => setShowImageGallery(false)}
              className="absolute top-4 right-4 w-10 h-10 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative w-full h-full flex items-center justify-center p-4">
              <motion.img
                key={currentImageIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                src={validImages[currentImageIndex]}
                alt={`${turf.name} - Image ${currentImageIndex + 1}`}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />

              {hasMultipleImages && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white border border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow-lg text-sm font-medium">
                    {currentImageIndex + 1} / {validImages.length}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
