import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Star, Clock, Users, Phone, MessageCircle, Wifi, Car, Coffee,
  Calendar, Heart, ChevronLeft, ChevronRight, Badge as BadgeIcon,
  Zap, Navigation, TrendingUp, Eye, DollarSign, Award,
  CheckCircle, Shield, Verified, ExternalLink
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { WhatsAppFallback } from './WhatsAppFallback';
import { generateBookingMessage } from '../lib/whatsapp';
import { analytics, track } from '../lib/analytics';
import { predictAvailability } from '../lib/availabilityPredictor';

export interface TurfData {
  id: string;
  name: string;
  address: string;
  rating: number;
  totalReviews: number;
  pricePerHour?: number;
  pricePerHourMin?: number;
  pricePerHourMax?: number;
  priceDisplay: string;
  amenities: string[];
  images: string[];
  slots: string[];
  contacts: Record<string, string | null>;
  coords?: { lat: number; lng: number } | null;
  distanceKm?: number | null;
  nextAvailable?: string;
  isPopular?: boolean;
  hasLights?: boolean;
  isVerified?: boolean;
  totalBookings?: number;
  responseTime?: string;
  instantBook?: boolean;
  gmap_embed_link?: string;
}

interface TurfCardEnhancedProps {
  turf: TurfData;
  onBook?: (turf: TurfData) => void;
  variant?: 'default' | 'compact' | 'featured';
  onClick?: () => void;
  user?: any;
  showStats?: boolean;
}

const amenityIcons: Record<string, React.ComponentType<any>> = {
  'parking': Car,
  'wifi': Wifi,
  'washroom': Users,
  'canteen': Coffee,
  'security': Shield,
  'flood_lights': Zap,
  'changing_room': Users
};

// Placeholder image helper
const getPlaceholderImage = (width: number, height: number, text: string = 'Turf') => {
  return `https://placehold.co/${width}x${height}/10b981/ffffff?text=${encodeURIComponent(text)}`;
};

export function TurfCardEnhanced({
  turf,
  onBook,
  variant = 'default',
  onClick,
  user,
  showStats = false
}: TurfCardEnhancedProps) {
  const [showWhatsAppFallback, setShowWhatsAppFallback] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Get availability prediction
  const availability = predictAvailability(turf.rating, turf.totalReviews);

  const handleWhatsAppClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = (turf.contact_info as any)?.phone || turf.contacts?.phone;
    if (!phone) return;

    const message = generateBookingMessage(turf);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

    const newWindow = window.open(whatsappUrl, '_blank');

    setTimeout(() => {
      if (newWindow && !newWindow.closed) {
        newWindow.close();
      }
      setShowWhatsAppFallback(true);
    }, 3000);
  };

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLiked(!isLiked);
    track('turf_liked', { turf_id: turf.id, liked: !isLiked });
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % turf.images.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + turf.images.length) % turf.images.length);
  };

  const formatAmenity = (amenity: string) => {
    return amenity.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (variant === 'compact') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={onClick}>
          <div className="flex">
            {/* Image */}
            <div className="relative w-24 h-24 flex-shrink-0">
              <img
                src={turf.images?.[0] || getPlaceholderImage(150, 150, 'Turf')}
                alt={turf.name}
                className="w-full h-full object-cover"
                onLoad={() => setImageLoaded(true)}
              />
              {turf.isVerified && (
                <div className="absolute top-1 right-1">
                  <Verified className="w-4 h-4 text-blue-500" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 p-3">
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-semibold text-sm leading-tight">{turf.name}</h3>
                <button onClick={handleLikeClick} className="p-1">
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                </button>
              </div>

              <div className="flex items-center gap-1 mb-1">
                <Star className="w-3.5 h-3.5 text-gray-900 fill-current" />
                <span className="text-xs font-semibold text-gray-900">{turf.rating}</span>
                <span className="text-xs text-gray-600">({turf.totalReviews} reviews)</span>
              </div>

              {turf.distanceKm && (
                <div className="text-xs text-gray-500 mb-2">
                  {turf.distanceKm.toFixed(1)} km away
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-emerald-600">{turf.priceDisplay}</span>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  if (variant === 'featured') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition-all duration-300 border-0 bg-gradient-to-br from-white to-emerald-50" onClick={onClick}>
          {/* Image with Overlay */}
          <div className="relative h-48 overflow-hidden">
            <motion.img
              src={turf.images?.[currentImageIndex] || getPlaceholderImage(400, 300, turf.name)}
              alt={turf.name}
              className="w-full h-full object-cover"
              onLoad={() => setImageLoaded(true)}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

            {/* Badges */}
            <div className="absolute top-3 left-3 flex flex-wrap gap-1">
              {turf.isPopular && (
                <Badge className="bg-orange-500 text-white text-xs">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Popular
                </Badge>
              )}
              {turf.isVerified && (
                <Badge className="bg-blue-500 text-white text-xs">
                  <Verified className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              )}
              {turf.instantBook && (
                <Badge className="bg-green-500 text-white text-xs">
                  <Zap className="w-3 h-3 mr-1" />
                  Instant Book
                </Badge>
              )}
            </div>

            {/* Heart Button */}
            <button
              onClick={handleLikeClick}
              className="absolute top-3 right-3 p-2 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors"
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
            </button>

            {/* Image Navigation */}
            {turf.images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 bg-black/30 rounded-full hover:bg-black/50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-black/30 rounded-full hover:bg-black/50 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-white" />
                </button>
                <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  {currentImageIndex + 1}/{turf.images.length}
                </div>
              </>
            )}

            {/* Quick Stats */}
            {showStats && (
              <div className="absolute bottom-3 left-3 flex gap-2">
                <div className="bg-black/50 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {Math.floor(Math.random() * 500) + 100}
                </div>
                <div className="bg-black/50 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {turf.totalBookings || Math.floor(Math.random() * 200) + 50}
                </div>
              </div>
            )}
          </div>

          <CardContent className="p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-bold text-lg leading-tight">{turf.name}</h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Star className="w-4 h-4 text-gray-900 fill-current" />
                <span className="font-semibold text-sm text-gray-900">{turf.rating}</span>
                <span className="text-sm text-gray-600">({turf.totalReviews})</span>
              </div>
            </div>

            {/* Distance */}
            {turf.distanceKm && (
              <div className="text-sm text-gray-600 mb-3">
                {turf.distanceKm.toFixed(1)} km away
              </div>
            )}

            {/* Sports */}
            <div className="flex flex-wrap gap-1 mb-3">
              {turf.slots?.slice(0, 3).map((sport) => (
                <Badge key={sport} variant="outline" className="text-xs">
                  {sport}
                </Badge>
              ))}
              {turf.slots && turf.slots.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{turf.slots.length - 3} more
                </Badge>
              )}
            </div>

            {/* Amenities */}
            <div className="flex flex-wrap gap-2 mb-4">
              {turf.amenities?.slice(0, 4).map((amenity) => {
                const IconComponent = amenityIcons[amenity.toLowerCase().replace(' ', '_')] || CheckCircle;
                return (
                  <div key={amenity} className="flex items-center gap-1 text-xs text-gray-600">
                    <IconComponent className="w-3 h-3" />
                    <span>{formatAmenity(amenity)}</span>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-emerald-600">{turf.priceDisplay}</span>
                  {turf.responseTime && (
                    <span className="text-xs text-gray-500">Responds in {turf.responseTime}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // Default variant
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="overflow-hidden cursor-pointer hover:shadow-lg transition-all duration-300" onClick={onClick}>
        {/* Image */}
        <div className="relative h-48 overflow-hidden">
          <motion.img
            src={turf.images?.[currentImageIndex] || getPlaceholderImage(400, 300, turf.name)}
            alt={turf.name}
            className="w-full h-full object-cover"
            onLoad={() => setImageLoaded(true)}
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.3 }}
          />

          {/* Quick Badges */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {turf.isPopular && (
              <Badge className="bg-orange-500 text-white text-xs">Popular</Badge>
            )}
            {turf.isVerified && (
              <Badge className="bg-blue-500 text-white text-xs">
                <Verified className="w-3 h-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>

          {/* Heart Button */}
          <button
            onClick={handleLikeClick}
            className="absolute top-2 right-2 p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
          </button>

          {/* Image Navigation */}
          {turf.images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 bg-black/30 rounded-full hover:bg-black/50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-black/30 rounded-full hover:bg-black/50 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
            </>
          )}
        </div>

        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-lg leading-tight">{turf.name}</h3>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Star className="w-4 h-4 text-gray-900 fill-current" />
              <span className="font-semibold text-sm text-gray-900">{turf.rating}</span>
              <span className="text-sm text-gray-600">({turf.totalReviews})</span>
            </div>
          </div>

          {/* Distance */}
          {turf.distanceKm && (
            <div className="text-sm text-gray-600 mb-3">
              {turf.distanceKm.toFixed(1)} km away
            </div>
          )}

          {/* Sports & Amenities */}
          <div className="space-y-2 mb-4">
            <div className="flex flex-wrap gap-1">
              {turf.slots?.slice(0, 3).map((sport) => (
                <Badge key={sport} variant="outline" className="text-xs">
                  {sport}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-600">
              {turf.amenities?.slice(0, 3).map((amenity) => {
                const IconComponent = amenityIcons[amenity.toLowerCase().replace(' ', '_')] || CheckCircle;
                return (
                  <div key={amenity} className="flex items-center gap-1">
                    <IconComponent className="w-3 h-3" />
                    <span>{formatAmenity(amenity)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-emerald-600">{turf.priceDisplay}</span>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      {showWhatsAppFallback && (
        <WhatsAppFallback
          turf={turf}
          onClose={() => setShowWhatsAppFallback(false)}
        />
      )}
    </motion.div>
  );
}