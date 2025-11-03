import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Star, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { WhatsAppFallback } from './WhatsAppFallback';
import { BookingModal } from './BookingModal';
import { generateBookingMessage } from '../lib/whatsapp';
import { analytics, track } from '../lib/analytics';

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
  external_review_url?: string;
  cover_image?: string;
}

interface TurfCardEnhancedProps {
  turf: TurfData;
  onBook?: (turf: TurfData) => void;
  variant?: 'default' | 'compact' | 'featured';
  onClick?: () => void;
  user?: any;
  showStats?: boolean;
}

export function TurfCardEnhanced({ turf, onBook, variant = 'default', onClick, user, showStats }: TurfCardEnhancedProps) {
  const [showWhatsAppFallback, setShowWhatsAppFallback] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleBookClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    analytics.bookingAttempted(turf.id, turf.nextAvailable || 'TBD', 10);
    setShowBookingModal(true);
    onBook?.(turf);
  };

  const handleWhatsAppFallback = () => {
    const phone = (turf.contact_info as any)?.phone || turf.contacts?.phone;
    if (phone) {
      setShowWhatsAppFallback(true);
      analytics.whatsappClicked('booking', 'turf_card');
    }
  };

  const handleCardClick = () => {
    analytics.cardViewed('turf', turf.id, turf.name);
    onClick?.();
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLiked(!isLiked);
    track('turf_liked', { turf_id: turf.id, liked: !isLiked });
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (turf.images.length > 1) {
      setCurrentImageIndex((prev) => (prev + 1) % turf.images.length);
    }
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (turf.images.length > 1) {
      setCurrentImageIndex((prev) => (prev - 1 + turf.images.length) % turf.images.length);
    }
  };

  const validImages = turf.images?.filter(img => img && img.trim() !== '') || [];
  const hasMultipleImages = validImages.length > 1;

  return (
    <motion.div
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group w-full"
    >
      <Card
        className="overflow-hidden bg-white rounded-2xl border-0 cursor-pointer transition-shadow duration-300 hover:shadow-xl"
        onClick={handleCardClick}
      >
        {/* Image Gallery - Larger, more prominent */}
        <div className="relative w-full aspect-[4/3] overflow-hidden">
          {validImages.length > 0 ? (
            <>
              <div className="relative w-full h-full">
                <img
                  src={validImages[currentImageIndex]}
                  alt={`${turf.name}`}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2310b981;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23059669;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='300' fill='url(%23grad)'/%3E%3Ctext x='200' y='140' text-anchor='middle' dy='.3em' fill='white' font-family='system-ui' font-size='48' opacity='0.8'%3E🏟️%3C/text%3E%3Ctext x='200' y='190' text-anchor='middle' dy='.3em' fill='white' font-family='system-ui' font-size='14' font-weight='500'%3E${encodeURIComponent(turf.name)}%3C/text%3E%3C/svg%3E`;
                  }}
                />
              </div>

              {/* Image Navigation - Show on hover */}
              {hasMultipleImages && isHovered && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all duration-200 z-10"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-800" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-md backdrop-blur-sm transition-all duration-200 z-10"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-800" />
                  </button>
                </>
              )}

              {/* Image Dots - Always visible */}
              {hasMultipleImages && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {validImages.map((_, index) => (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex(index);
                      }}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                        index === currentImageIndex ? 'bg-white w-4' : 'bg-white/60'
                      }`}
                      aria-label={`Go to image ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-5xl mb-2 opacity-80">🏟️</div>
                <div className="text-sm font-medium opacity-90">{turf.name}</div>
              </div>
            </div>
          )}

          {/* Heart/Like button - Top right */}
          <button
            onClick={handleLike}
            className="absolute top-3 right-3 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 shadow-sm hover:scale-105 z-10"
            aria-label={`${isLiked ? 'Remove from' : 'Add to'} favorites`}
          >
            <Heart
              className={`w-4 h-4 transition-all duration-200 ${
                isLiked
                  ? 'fill-red-500 text-red-500'
                  : 'text-gray-700 hover:text-red-500'
              }`}
            />
          </button>

          {/* Popular badge - Top left (minimal) */}
          {turf.isPopular && (
            <div className="absolute top-3 left-3">
              <Badge className="bg-white/90 text-gray-800 shadow-sm backdrop-blur-sm border-0 text-xs font-medium px-2 py-0.5">
                Popular
              </Badge>
            </div>
          )}
        </div>

        {/* Card Content - Minimal, clean */}
        <CardContent className="p-3">
          {/* Location and Rating row */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[15px] text-gray-900 truncate">
                {turf.name}
              </h3>
              <button
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors mt-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  const mapsUrl = turf.coords
                    ? `https://maps.google.com/maps?q=${turf.coords.lat},${turf.coords.lng}&z=15`
                    : `https://maps.google.com/maps/dir//${encodeURIComponent(turf.address)}`;
                  window.open(mapsUrl, '_blank');
                  track('whatsapp_cta_clicked', { action: 'google_maps', context: 'turf_card', turf_id: turf.id });
                }}
                title="Open in Google Maps"
              >
                <span className="truncate text-sm text-gray-600">{turf.address}</span>
              </button>
            </div>

            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Star className="w-3.5 h-3.5 fill-gray-900 text-gray-900" />
              <span className="font-medium text-sm text-gray-900">{Number(turf.rating).toFixed(1)}</span>
            </div>
          </div>

          {/* Distance */}
          {typeof turf.distanceKm === 'number' && (
            <div className="text-xs text-gray-500 mb-2">
              {turf.distanceKm.toFixed(1)} km away
            </div>
          )}

          {/* Amenities - Minimal display */}
          {turf.amenities.length > 0 && (
            <div className="text-xs text-gray-600 mb-2 truncate">
              {turf.amenities.slice(0, 2).join(' · ')}
              {turf.amenities.length > 2 && ` · +${turf.amenities.length - 2}`}
            </div>
          )}

          {/* Price - Prominent */}
          <div className="flex items-baseline gap-1 mt-2 pt-2 border-t border-gray-100">
            <span className="font-semibold text-[15px] text-gray-900">
              {turf.priceDisplay}
            </span>
            <span className="text-sm text-gray-600">per hour</span>
          </div>
        </CardContent>
      </Card>

      {/* Booking Modal */}
      <BookingModal
        open={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        turf={turf}
        onBookingSuccess={(booking) => {
          console.log('Booking successful:', booking);
          setShowBookingModal(false);
        }}
      />

      {/* WhatsApp Fallback Modal */}
      {showWhatsAppFallback && ((turf.contact_info as any)?.phone || turf.contacts?.phone) && (
        <WhatsAppFallback
          isOpen={showWhatsAppFallback}
          onClose={() => setShowWhatsAppFallback(false)}
          phone={(turf.contact_info as any)?.phone || turf.contacts?.phone || ''}
          message={generateBookingMessage({
            turfName: turf.name,
            address: turf.address,
            date: 'Today',
            slot: turf.nextAvailable || 'Next available',
            players: 10,
            notes: 'Found via TapTurf app'
          })}
          context="turf_booking"
        />
      )}
    </motion.div>
  );
}
