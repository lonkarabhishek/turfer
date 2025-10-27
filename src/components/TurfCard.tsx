import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Star, Clock, Users, Phone, MessageCircle, Wifi, Car, Coffee, Calendar, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
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
  gmap_embed_link?: string;
}

interface TurfCardProps {
  turf: TurfData;
  onBook?: (turf: TurfData) => void;
  variant?: 'default' | 'compact';
  onClick?: () => void;
  user?: any;
}

export function TurfCard({ turf, onBook, variant = 'default', onClick, user }: TurfCardProps) {
  const [showWhatsAppFallback, setShowWhatsAppFallback] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isLiked, setIsLiked] = useState(false);

  const handleBookClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    analytics.bookingAttempted(turf.id, turf.nextAvailable || 'TBD', 10);
    setShowBookingModal(true);
    onBook?.(turf);
  };

  const handleWhatsAppFallback = () => {
    if (turf.contacts?.phone) {
      setShowWhatsAppFallback(true);
      analytics.whatsappClicked('booking', 'turf_card');
    }
  };

  const handleCallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (turf.contacts?.phone) {
      window.open(`tel:${turf.contacts.phone}`, '_blank');
      track('whatsapp_cta_clicked', { action: 'call', turf_id: turf.id });
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

  const getAmenityIcon = (amenity: string) => {
    if (!amenity || typeof amenity !== 'string') return null;
    
    const lower = amenity.toLowerCase();
    if (lower.includes('parking')) return <Car className="w-3 h-3" />;
    if (lower.includes('wifi')) return <Wifi className="w-3 h-3" />;
    if (lower.includes('coffee') || lower.includes('cafe')) return <Coffee className="w-3 h-3" />;
    return null;
  };

  const validImages = turf.images?.filter(img => img && img.trim() !== '') || [];
  const hasMultipleImages = validImages.length > 1;

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="group"
    >
      <Card 
        className="overflow-hidden bg-white rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer border-0 group-hover:shadow-black/10"
        onClick={handleCardClick}
      >
        {/* Image Gallery */}
        <div className={`relative w-full overflow-hidden ${variant === 'compact' ? 'aspect-[4/3]' : 'aspect-[5/4]'}`}>
          {validImages.length > 0 ? (
            <>
              <div className="relative w-full h-full">
                <img
                  src={validImages[currentImageIndex]}
                  alt={`${turf.name} - Image ${currentImageIndex + 1}`}
                  className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='320' viewBox='0 0 400 320'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2310b981;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23059669;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='400' height='320' fill='url(%23grad)'/%3E%3Ctext x='200' y='140' text-anchor='middle' dy='.3em' fill='white' font-family='system-ui' font-size='48' opacity='0.8'%3E🏟️%3C/text%3E%3Ctext x='200' y='200' text-anchor='middle' dy='.3em' fill='white' font-family='system-ui' font-size='16' font-weight='500'%3E${encodeURIComponent(turf.name)}%3C/text%3E%3C/svg%3E`;
                  }}
                />
              </div>

              {/* Image Navigation */}
              {hasMultipleImages && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg backdrop-blur-sm"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-700" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg backdrop-blur-sm"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-700" />
                  </button>
                  
                  {/* Image Dots */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                    {validImages.map((_, index) => (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImageIndex(index);
                        }}
                        className={`w-2 h-2 rounded-full transition-all duration-200 ${
                          index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-6xl mb-3 opacity-80">🏟️</div>
                <div className="text-lg font-semibold">{turf.name}</div>
                <div className="text-sm opacity-80 mt-1">Sports Facility</div>
              </div>
            </div>
          )}
          
          {/* Top Overlay */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              {turf.isPopular && (
                <Badge className="bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-lg border-0 rounded-full px-3 py-1">
                  ⭐ Popular
                </Badge>
              )}
              {turf.hasLights && (
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-lg border-0 rounded-full px-3 py-1">
                  💡 Night Play
                </Badge>
              )}
            </div>

            {/* Heart/Like button */}
            <button
              onClick={handleLike}
              className="w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center backdrop-blur-sm transition-all duration-200 shadow-lg hover:scale-105"
              aria-label={`${isLiked ? 'Remove from' : 'Add to'} favorites`}
            >
              <Heart 
                className={`w-5 h-5 transition-all duration-200 ${
                  isLiked 
                    ? 'fill-red-500 text-red-500 scale-110' 
                    : 'text-gray-600 hover:text-red-500'
                }`} 
              />
            </button>
          </div>

          {/* Bottom Left Badge */}
          {turf.nextAvailable && (
            <div className="absolute bottom-4 left-4">
              <Badge className="bg-white/95 text-gray-800 shadow-lg backdrop-blur-sm border-0 rounded-full px-3 py-1">
                <Clock className="w-3 h-3 mr-1 text-green-600" />
                <span className="text-green-600 font-medium">Next: {turf.nextAvailable}</span>
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="p-5 space-y-4">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-xl text-gray-900 line-clamp-1 flex-1">
                {turf.name}
              </h3>
              
              <div className="flex items-center gap-1 flex-shrink-0">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="font-semibold text-sm">{Number(turf.rating).toFixed(1)}</span>
                <span className="text-sm text-gray-500">({turf.totalReviews})</span>
              </div>
            </div>
            
            <button
              className="flex items-start text-sm text-gray-600 gap-2 hover:text-emerald-600 transition-colors group w-full text-left"
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
              <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5 group-hover:text-emerald-600" />
              <div className="flex-1">
                <div className="line-clamp-1 group-hover:underline">{turf.address}</div>
                {typeof turf.distanceKm === 'number' && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    {turf.distanceKm.toFixed(1)} km away
                  </div>
                )}
              </div>
            </button>
          </div>

          {/* Amenities */}
          {turf.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {turf.amenities.slice(0, 3).map((amenity) => (
                <Badge 
                  key={amenity} 
                  variant="secondary" 
                  className="text-xs rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 border-0 px-2.5 py-1"
                >
                  {getAmenityIcon(amenity)}
                  {getAmenityIcon(amenity) ? (
                    <span className="ml-1">{amenity}</span>
                  ) : (
                    amenity
                  )}
                </Badge>
              ))}
              {turf.amenities.length > 3 && (
                <Badge variant="outline" className="text-xs rounded-full border-gray-300 text-gray-600 px-2.5 py-1">
                  +{turf.amenities.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Available Slots Preview */}
          {turf.slots && turf.slots.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Available today:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {turf.slots.slice(0, 3).map((slot, idx) => (
                  <Badge 
                    key={idx}
                    className="text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors px-2.5 py-1"
                  >
                    {slot}
                  </Badge>
                ))}
                {turf.slots.length > 3 && (
                  <Badge className="text-xs rounded-full bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1">
                    +{turf.slots.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Price and CTA */}
          <div className="flex items-end justify-between pt-3 border-t border-gray-100">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold text-2xl text-gray-900">
                  {turf.priceDisplay}
                </span>
              </div>
              <div className="text-sm text-gray-600 font-medium">All inclusive</div>
            </div>
            
            <div className="flex items-center gap-2">
              {user ? (
                <>
                  {turf.contacts?.phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCallClick}
                      className="hidden sm:flex rounded-full border-gray-300 hover:border-emerald-500 hover:text-emerald-600"
                    >
                      <Phone className="w-4 h-4 mr-1" />
                      Call
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-full px-6 py-2 font-semibold shadow-lg hover:shadow-emerald-200 transition-all duration-200"
                    onClick={handleBookClick}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Book Now
                  </Button>
                </>
              ) : (
                <div className="text-sm text-gray-500 bg-gray-50 px-4 py-2 rounded-full border border-gray-200">
                  Sign in to book
                </div>
              )}
            </div>
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
      {showWhatsAppFallback && turf.contacts?.phone && (
        <WhatsAppFallback
          isOpen={showWhatsAppFallback}
          onClose={() => setShowWhatsAppFallback(false)}
          phone={turf.contacts.phone}
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