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
import { useAuth } from '../hooks/useAuth';
import type { TurfData } from './TurfCard';
import { GameCard, type GameData } from './GameCard';
import { generateBookingMessage } from '../lib/whatsapp';
import { predictAvailability } from '../lib/availabilityPredictor';
import { filterNonExpiredGames } from '../lib/gameUtils';

// Sample turf data for fallback when database turfs are not available
const SAMPLE_TURFS = [
  {
    id: 'turf_1',
    name: 'Big Bounce Turf',
    address: 'Govind Nagar Link Road, Govind Nagar, Nashik',
    rating: 4.5,
    totalReviews: 128,
    priceDisplay: '₹400-600/hr',
    pricePerHour: 500,
    amenities: ['Parking', 'Washroom', 'Water', 'Lighting'],
    images: ['/api/placeholder/400/300', '/api/placeholder/400/301', '/api/placeholder/400/302'],
    slots: ['Football', 'Cricket'],
    contacts: { phone: '9876543210', whatsapp: '9876543210' },
    coords: { lat: 19.9975, lng: 73.7898 },
    nextAvailable: '6:00 PM Today',
    isPopular: true,
    hasLights: true,
    distanceKm: 2.5
  },
  {
    id: 'turf_2',
    name: 'Greenfield The Multisports Turf',
    address: 'Near K.K. Wagh Engineering, Gangotri Vihar, Nashik',
    rating: 4.2,
    totalReviews: 89,
    priceDisplay: '₹350-550/hr',
    pricePerHour: 450,
    amenities: ['Parking', 'Washroom', 'Cafeteria', 'First Aid'],
    images: ['/api/placeholder/400/303', '/api/placeholder/400/304'],
    slots: ['Football', 'Basketball'],
    contacts: { phone: '9876543211', whatsapp: '9876543211' },
    coords: { lat: 19.9945, lng: 73.7868 },
    nextAvailable: '7:00 PM Today',
    isPopular: false,
    hasLights: true,
    distanceKm: 3.1
  },
  {
    id: 'turf_3',
    name: 'Kridabhumi – The Multisports Turf',
    address: 'Behind Maruti Wafers, Tigraniya Road, Dwarka, Nashik',
    rating: 4.7,
    totalReviews: 156,
    priceDisplay: '₹600-900/hr',
    pricePerHour: 750,
    amenities: ['Flood Lights', 'Parking', 'Washrooms', 'Changing Rooms', 'Drinking Water', 'First Aid'],
    images: ['/api/placeholder/400/305', '/api/placeholder/400/306', '/api/placeholder/400/307'],
    slots: ['Football', 'Cricket'],
    contacts: { phone: '9028960311', whatsapp: '9028960311' },
    coords: { lat: 19.9925, lng: 73.7888 },
    nextAvailable: '5:00 PM Today',
    isPopular: true,
    hasLights: true,
    distanceKm: 1.8
  }
];

interface TurfDetailPageEnhancedProps {
  turfId: string;
  onBack: () => void;
  onCreateGame?: () => void;
  onBookTurf?: () => void;
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
  onBookTurf
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

  // Mock data for enhanced features
  const mockReviews: Review[] = [
    {
      id: '1',
      user: { name: 'Rajesh Kumar', avatar: '', rating: 4.5 },
      rating: 5,
      comment: 'Excellent turf with great facilities. The lighting is perfect for evening games!',
      date: '2 days ago',
      verified: true,
      helpful: 12
    },
    {
      id: '2',
      user: { name: 'Priya Sharma', avatar: '', rating: 4.2 },
      rating: 4,
      comment: 'Good turf but parking can be a bit crowded during peak hours.',
      date: '1 week ago',
      verified: true,
      helpful: 8
    }
  ];

  useEffect(() => {
    loadTurfDetails();
    setReviews(mockReviews);
    setViewCount(Math.floor(Math.random() * 500) + 100);
  }, [turfId]);

  const loadTurfDetails = async () => {
    setLoading(true);
    try {
      // First try to load from database
      const response = await turfsAPI.getById(turfId);
      if (response.success && response.data) {
        setTurf(response.data);
        loadUpcomingGames();
        generateMockAvailability();
      } else {
        // Fallback to sample turfs for demo purposes
        console.log('🔄 Turf not found in database, using sample data for:', turfId);
        const sampleTurf = SAMPLE_TURFS.find(turf => turf.id === turfId);
        if (sampleTurf) {
          setTurf(sampleTurf as any);
          generateMockAvailability();
          // Don't load games for sample turfs since they won't exist
        } else {
          console.error('❌ Turf not found in database or samples:', turfId);
        }
      }
    } catch (error) {
      console.error('Error loading turf details:', error);
      // Try sample turfs as final fallback
      const sampleTurf = SAMPLE_TURFS.find(turf => turf.id === turfId);
      if (sampleTurf) {
        console.log('🔄 Using sample turf due to error:', turfId);
        setTurf(sampleTurf as any);
        generateMockAvailability();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUpcomingGames = async () => {
    try {
      const response = await gamesAPI.getAvailable();
      if (response.success && response.data) {
        const turfGames = response.data
          .filter((game: any) => game.turf_id === turfId || game.turf_name === turf?.name);
        const nonExpiredTurfGames = filterNonExpiredGames(turfGames);
        setUpcomingGames(nonExpiredTurfGames.slice(0, 3));
      }
    } catch (error) {
      console.error('Error loading games:', error);
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

  const nextImage = () => {
    if (turf?.images) {
      setCurrentImageIndex((prev) => (prev + 1) % turf.images.length);
    }
  };

  const prevImage = () => {
    if (turf?.images) {
      setCurrentImageIndex((prev) => (prev - 1 + turf.images.length) % turf.images.length);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: turf?.name,
          text: `Check out ${turf?.name} on TapTurf`,
          url: window.location.href,
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-emerald-50">
      {/* Hero Section with Image Gallery */}
      <div className="relative h-[60vh] md:h-[70vh] bg-gray-900 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.img
            key={currentImageIndex}
            src={turf.images[currentImageIndex] || '/api/placeholder/800/400'}
            alt={turf.name}
            className="w-full h-full object-cover"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </AnimatePresence>

        {/* Animated overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-70" />

        {/* Diagonal pattern overlay */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, white 10px, white 20px)`
        }} />

        {/* Image Navigation */}
        {turf.images.length > 1 && (
          <>
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <Button
                onClick={prevImage}
                variant="ghost"
                size="sm"
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white border border-white/20 rounded-full w-12 h-12 p-0 shadow-2xl"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <Button
                onClick={nextImage}
                variant="ghost"
                size="sm"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white border border-white/20 rounded-full w-12 h-12 p-0 shadow-2xl"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            </motion.div>
          </>
        )}

        {/* Header Controls */}
        <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-20">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              onClick={onBack}
              variant="ghost"
              size="sm"
              className="bg-white/10 backdrop-blur-md hover:bg-white/20 text-white border border-white/20 rounded-full"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </motion.div>

          <div className="flex gap-2">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                onClick={() => setIsLiked(!isLiked)}
                variant="ghost"
                size="sm"
                className="bg-white/10 backdrop-blur-md hover:bg-white/20 text-white border border-white/20 rounded-full w-10 h-10 p-0"
              >
                <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                onClick={() => setIsBookmarked(!isBookmarked)}
                variant="ghost"
                size="sm"
                className="bg-white/10 backdrop-blur-md hover:bg-white/20 text-white border border-white/20 rounded-full w-10 h-10 p-0"
              >
                <Bookmark className={`w-5 h-5 ${isBookmarked ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                onClick={handleShare}
                variant="ghost"
                size="sm"
                className="bg-white/10 backdrop-blur-md hover:bg-white/20 text-white border border-white/20 rounded-full w-10 h-10 p-0"
              >
                <Share2 className="w-5 h-5" />
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Image Counter & Gallery Dots */}
        <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3">
          <div className="flex gap-2">
            {turf.images.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentImageIndex(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentImageIndex
                    ? 'w-8 bg-white'
                    : 'w-2 bg-white/50 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
          <div className="bg-black/30 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm font-medium border border-white/20">
            {currentImageIndex + 1} / {turf.images.length}
          </div>
        </div>

        {/* Floating badges */}
        <div className="absolute top-24 right-6 flex flex-col gap-2 z-10">
          <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Badge className="bg-emerald-500 text-white border-0 shadow-xl px-4 py-2">
              <Verified className="w-4 h-4 mr-1" />
              Verified
            </Badge>
          </motion.div>
          {turf.isPopular && (
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Badge className="bg-orange-500 text-white border-0 shadow-xl px-4 py-2">
                <TrendingUp className="w-4 h-4 mr-1" />
                Popular
              </Badge>
            </motion.div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Turf Header */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-3xl shadow-2xl p-8 -mt-32 relative z-10 mb-8 border border-gray-100"
        >
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
            <div className="flex-1">
              {/* Title */}
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-1">
                  <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 leading-tight">{turf.name}</h1>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1 bg-yellow-50 px-3 py-1 rounded-full">
                      <Star className="w-5 h-5 text-yellow-500 fill-current" />
                      <span className="font-bold text-gray-900">{turf.rating}</span>
                      <span className="text-gray-600 text-sm">({turf.totalReviews} reviews)</span>
                    </div>
                    {turf.distanceKm && (
                      <div className="flex items-center gap-1 bg-blue-50 px-3 py-1 rounded-full text-blue-700">
                        <Navigation className="w-4 h-4" />
                        <span className="text-sm font-medium">{turf.distanceKm.toFixed(1)} km</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 bg-gray-50 px-3 py-1 rounded-full text-gray-600">
                      <Eye className="w-4 h-4" />
                      <span className="text-sm">{viewCount} views</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="flex items-start gap-2 text-gray-600 mb-6 p-4 bg-gray-50 rounded-xl">
                <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{turf.address}</p>
                  <a
                    href={getGoogleMapsUrl(turf.address, turf.coords)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 transition-colors text-sm inline-flex items-center gap-1 mt-1"
                  >
                    <span>View on Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Sports */}
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-500 mb-3">AVAILABLE SPORTS</p>
                <div className="flex flex-wrap gap-2">
                  {turf.slots?.map((sport) => {
                    const SportIcon = sportIcons[sport]?.icon || Target;
                    const sportColor = sportIcons[sport]?.color || 'text-gray-600';
                    return (
                      <Badge key={sport} className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-colors px-4 py-2">
                        <SportIcon className={`w-4 h-4 mr-2 ${sportColor}`} />
                        <span className="font-semibold">{sport}</span>
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* Pricing */}
              <div className="flex items-center gap-2 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-200">
                <DollarSign className="w-6 h-6 text-emerald-600" />
                <div>
                  <p className="text-sm text-gray-600">Starting from</p>
                  <p className="text-2xl font-bold text-emerald-600">{turf.priceDisplay}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-4 lg:w-80">
              {/* Availability Prediction */}
              {availabilityPrediction && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border-2 border-gray-200 shadow-inner"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-3xl">{availabilityPrediction.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Availability</p>
                      <p className={`text-sm ${availabilityPrediction.color} font-bold`}>
                        {availabilityPrediction.message}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* WhatsApp Button */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={() => {
                    const message = generateBookingMessage(turf);
                    const whatsappUrl = `https://api.whatsapp.com/send?phone=${turf.contacts?.phone}&text=${encodeURIComponent(message)}`;
                    window.open(whatsappUrl, '_blank');
                  }}
                  className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-semibold py-6 rounded-xl shadow-lg hover:shadow-xl transition-all text-lg"
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Chat to Book on WhatsApp
                </Button>
              </motion.div>

              {onCreateGame && (
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={onCreateGame}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold py-6 rounded-xl shadow-lg hover:shadow-xl transition-all"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Create a Game Here
                  </Button>
                </motion.div>
              )}

              {turf.contacts?.phone && (
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    variant="outline"
                    className="w-full border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-6 rounded-xl"
                    onClick={() => window.open(`tel:${turf.contacts.phone}`, '_self')}
                  >
                    <Phone className="w-5 h-5 mr-2" />
                    Call Owner
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-2 mb-6">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl font-semibold transition-all"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="availability"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl font-semibold transition-all"
            >
              Availability
            </TabsTrigger>
            <TabsTrigger
              value="games"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl font-semibold transition-all"
            >
              Games
            </TabsTrigger>
            <TabsTrigger
              value="reviews"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl font-semibold transition-all"
            >
              Reviews
            </TabsTrigger>
            <TabsTrigger
              value="gallery"
              className="hidden lg:block data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl font-semibold transition-all"
            >
              Gallery
            </TabsTrigger>
            <TabsTrigger
              value="location"
              className="hidden lg:block data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-xl font-semibold transition-all"
            >
              Location
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Amenities */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-600" />
                  Facilities & Amenities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {turf.amenities?.map((amenity) => {
                    const amenityData = amenityIcons[amenity.toLowerCase().replace(' ', '_')] ||
                                       { icon: CheckCircle, label: amenity, color: 'text-gray-600' };
                    const AmenityIcon = amenityData.icon;

                    return (
                      <div key={amenity} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <AmenityIcon className={`w-5 h-5 ${amenityData.color}`} />
                        <span className="text-sm font-medium">{amenityData.label}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Operating Hours */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  Operating Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <Sun className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-medium">Weekdays</p>
                      <p className="text-sm text-gray-600">6:00 AM - 12:00 AM</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
                    <Moon className="w-5 h-5 text-orange-600" />
                    <div>
                      <p className="font-medium">Weekends</p>
                      <p className="text-sm text-gray-600">6:00 AM - 12:00 AM</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Check Availability</CardTitle>
                <p className="text-gray-600">Select a date to view available time slots</p>
              </CardHeader>
              <CardContent>
                {/* Date Selector */}
                <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
                  {availability.map(({ date }) => {
                    const dateObj = new Date(date);
                    const isSelected = date === selectedDate;
                    const isToday = date === new Date().toISOString().split('T')[0];

                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        className={`
                          flex flex-col items-center gap-1 p-3 rounded-lg border whitespace-nowrap
                          ${isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white hover:bg-gray-50 border-gray-200'
                          }
                        `}
                      >
                        <span className="text-xs font-medium">
                          {isToday ? 'Today' : dateObj.toLocaleDateString('en', { weekday: 'short' })}
                        </span>
                        <span className="text-sm">
                          {dateObj.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Time Slots */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {availability
                    .find(({ date }) => date === selectedDate)
                    ?.slots.map((slot) => (
                      <motion.button
                        key={slot.time}
                        whileHover={{ scale: slot.available ? 1.02 : 1 }}
                        whileTap={{ scale: slot.available ? 0.98 : 1 }}
                        disabled={!slot.available}
                        onClick={() => {
                          if (slot.available && turf.contacts?.phone) {
                            const message = generateBookingMessage(turf);
                            const whatsappUrl = `https://api.whatsapp.com/send?phone=${turf.contacts.phone}&text=${encodeURIComponent(message)}`;
                            window.open(whatsappUrl, '_blank');
                          }
                        }}
                        className={`
                          p-3 rounded-lg border text-left relative overflow-hidden
                          ${slot.available
                            ? 'bg-white hover:bg-emerald-50 border-gray-200 hover:border-emerald-300'
                            : 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60'
                          }
                          ${slot.isPopular ? 'ring-2 ring-orange-200' : ''}
                        `}
                      >
                        {slot.isPopular && (
                          <Badge className="absolute top-1 right-1 text-xs bg-orange-500">
                            Popular
                          </Badge>
                        )}

                        <div className="text-sm font-medium">
                          {formatTime(slot.time)}
                        </div>
                        <div className="text-xs text-gray-600">
                          {slot.available ? (
                            <>
                              ₹{slot.price}
                              {slot.discount && (
                                <span className="text-green-600 font-medium ml-1">
                                  ({slot.discount}% off)
                                </span>
                              )}
                            </>
                          ) : (
                            'Booked'
                          )}
                        </div>
                      </motion.button>
                    ))
                  }
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
                {upcomingGames.length > 0 ? (
                  <div className="grid gap-4">
                    {upcomingGames.map((game) => (
                      <GameCard key={game.id} game={game} variant="compact" />
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Location Tab */}
          <TabsContent value="location" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-emerald-600" />
                  Location & Directions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-100 rounded-lg">
                    <p className="font-medium mb-2">Address</p>
                    <div className="flex items-start gap-2">
                      <p className="text-gray-700 flex-1">{turf.address}</p>
                      <a
                        href={getGoogleMapsUrl(turf.address, turf.coords)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                        title="View on Google Maps"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    {turf.coords && (
                      <p className="text-sm text-gray-500 mt-2">
                        Coordinates: {turf.coords.lat.toFixed(6)}, {turf.coords.lng.toFixed(6)}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <a
                      href={getGoogleMapsDirectionsUrl(turf.address, turf.coords)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full"
                    >
                      <Button variant="outline" className="w-full flex items-center gap-2 hover:bg-blue-50 hover:border-blue-300">
                        <Navigation className="w-4 h-4" />
                        Get Directions
                      </Button>
                    </a>
                    <a
                      href={getGoogleMapsUrl(turf.address, turf.coords)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full"
                    >
                      <Button variant="outline" className="w-full flex items-center gap-2 hover:bg-green-50 hover:border-green-300">
                        <Map className="w-4 h-4" />
                        View on Maps
                      </Button>
                    </a>
                    {turf.contacts?.phone && (
                      <a href={`tel:${turf.contacts.phone}`} className="w-full">
                        <Button variant="outline" className="w-full flex items-center gap-2 hover:bg-emerald-50 hover:border-emerald-300">
                          <Phone className="w-4 h-4" />
                          Call Turf
                        </Button>
                      </a>
                    )}
                  </div>

                  {/* Enhanced map placeholder with Google Maps integration */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-emerald-500 text-white p-4">
                      <h4 className="font-medium mb-1">Interactive Map</h4>
                      <p className="text-sm text-blue-100">Click to open Google Maps</p>
                    </div>
                    <a
                      href={getGoogleMapsUrl(turf.address, turf.coords)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-48 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center text-gray-600">
                          <MapPin className="w-12 h-12 mx-auto mb-2" />
                          <p className="font-medium mb-1">{turf.name}</p>
                          <p className="text-sm">Click to view on Google Maps</p>
                          <div className="flex items-center justify-center gap-1 mt-2 text-blue-600">
                            <ExternalLink className="w-4 h-4" />
                            <span className="text-sm">Open in Google Maps</span>
                          </div>
                        </div>
                      </div>
                    </a>
                  </div>

                  {/* Additional location info */}
                  {turf.distanceKm && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <Navigation className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Approximately {turf.distanceKm.toFixed(1)} km from your location
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

    </div>
  );
}