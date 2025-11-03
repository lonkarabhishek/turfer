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
import { TurfReviewSystem } from './TurfReviewSystem';

interface TurfDetailPageProps {
  turfId: string;
  onBack: () => void;
  onCreateGame?: () => void;
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

const timeSlots = [
  '05:00-06:00', '06:00-07:00', '07:00-08:00', '08:00-09:00', '09:00-10:00',
  '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00', '14:00-15:00',
  '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00-20:00',
  '20:00-21:00', '21:00-22:00'
];

export function TurfDetailPage({ turfId, onBack, onCreateGame }: TurfDetailPageProps) {
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
        const turfGames = response.data.filter((game: any) => {
          const gameTurfName = game.turfs?.name || game.turf_name || game.turfName || '';
          return gameTurfName.toLowerCase() === turf?.name.toLowerCase();
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

  const validImages = turf?.images?.filter(img => img && img.trim() !== '') || [];
  const hasMultipleImages = validImages.length > 1;

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

  // Mock reviews data - replace with actual API data
  const mockReviews = [
    {
      id: '1',
      user: {
        id: 'user1',
        name: 'Rajesh Kumar',
        avatar: '',
        totalReviews: 12,
        joinedDate: '2023-01-15'
      },
      rating: 5,
      title: 'Excellent turf with great maintenance',
      comment: 'The turf quality is outstanding. Well-maintained grass, proper lighting for night games, and friendly staff. Definitely worth the price!',
      date: '2024-10-15',
      verified: true,
      helpful: 24,
      notHelpful: 2,
      visitDate: '2024-10-10',
      gameType: 'Football'
    },
    {
      id: '2',
      user: {
        id: 'user2',
        name: 'Priya Sharma',
        avatar: '',
        totalReviews: 8,
        joinedDate: '2023-05-20'
      },
      rating: 4,
      title: 'Good facilities, could be better',
      comment: 'Overall good experience. The changing rooms are clean and parking is convenient. However, could use better seating arrangements for spectators.',
      date: '2024-10-12',
      verified: true,
      helpful: 15,
      notHelpful: 1,
      visitDate: '2024-10-08',
      gameType: 'Cricket'
    }
  ];

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
                />
              </div>

              {/* Side images */}
              {validImages.slice(1, 5).map((img, idx) => (
                <div key={idx} className="hidden sm:block col-span-2 sm:col-span-1 relative group">
                  <img
                    src={img}
                    alt={`${turf.name} ${idx + 2}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
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

            {/* Reviews Section */}
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

              <TurfReviewSystem
                turfId={turf.id}
                turfName={turf.name}
                reviews={mockReviews}
                overallRating={turf.rating}
                totalReviews={turf.totalReviews}
              />
            </motion.div>

            {/* Time Slots */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="pb-8"
            >
              <h2 className="text-xl sm:text-2xl font-semibold mb-4">Available time slots</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {availability[0]?.slots.slice(0, 12).map((slot) => (
                  <button
                    key={slot.time}
                    onClick={() => slot.available && handleBookSlot(slot)}
                    disabled={!slot.available || booking}
                    className={`p-4 rounded-xl text-sm font-medium transition-all duration-200 ${
                      slot.available
                        ? 'border border-gray-300 hover:border-gray-900 hover:shadow-md'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    }`}
                  >
                    <div className="font-semibold">{slot.time}</div>
                    <div className="text-xs mt-1">
                      {slot.available ? `₹${slot.price}` : 'Booked'}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Open Games */}
            {turfGames.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="pb-8"
              >
                <h2 className="text-xl sm:text-2xl font-semibold mb-4">Games happening here</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {turfGames.slice(0, 4).map((game) => (
                    <GameCard
                      key={game.id}
                      game={game}
                      user={user}
                      onGameClick={(gameId) => {
                        console.log('Game clicked:', gameId);
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          {/* Sticky Sidebar - Airbnb Style */}
          <div className="lg:col-span-1">
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
                        {turf.priceDisplay}
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
                        // Handle booking
                      }}
                    >
                      Check availability
                    </Button>

                    {turf.contacts?.phone && (
                      <Button
                        variant="outline"
                        className="w-full rounded-lg py-6 text-base font-medium border-2 border-gray-300 hover:border-gray-900 hover:bg-gray-50"
                        onClick={() => window.open(`tel:${turf.contacts?.phone}`, '_blank')}
                      >
                        <Phone className="w-5 h-5 mr-2" />
                        Contact
                      </Button>
                    )}

                    {onCreateGame && isAuthenticated && (
                      <Button
                        variant="outline"
                        className="w-full rounded-lg py-6 text-base font-medium border-2 border-blue-300 hover:border-blue-600 hover:bg-blue-50 text-blue-600"
                        onClick={onCreateGame}
                      >
                        <Users className="w-5 h-5 mr-2" />
                        Create Game
                      </Button>
                    )}
                  </div>

                  <div className="pt-4 border-t border-gray-200 space-y-2 text-center text-sm text-gray-600">
                    <p>You won't be charged yet</p>
                  </div>
                </CardContent>
              </Card>
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
