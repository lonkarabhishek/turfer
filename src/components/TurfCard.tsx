import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Star, Clock, Users, Phone, MessageCircle, Wifi, Car, Coffee, Calendar } from 'lucide-react';
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

  const handleBookClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    analytics.bookingAttempted(turf.id, turf.nextAvailable || 'TBD', 10);
    
    // Show booking modal for modern in-app booking
    setShowBookingModal(true);
    
    onBook?.(turf);
  };

  const handleWhatsAppFallback = () => {
    // Fallback to WhatsApp for backup
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

  const getAmenityIcon = (amenity: string) => {
    const lower = amenity.toLowerCase();
    if (lower.includes('parking')) return <Car className="w-3 h-3" />;
    if (lower.includes('wifi')) return <Wifi className="w-3 h-3" />;
    if (lower.includes('coffee') || lower.includes('cafe')) return <Coffee className="w-3 h-3" />;
    return null;
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      <Card 
        className="overflow-hidden hover:shadow-airbnb transition-all duration-200 cursor-pointer"
        onClick={handleCardClick}
      >
        {/* Image */}
        <div className={`relative w-full overflow-hidden ${variant === 'compact' ? 'aspect-[16/10]' : 'aspect-[16/9]'}`}>
{turf.images && turf.images.length > 0 && turf.images[0] ? (
            <img
              src={turf.images[0]}
              alt={`${turf.name} turf facility`}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
              loading="lazy"
              onError={(e) => {
                // Simple error handling without DOM manipulation
                e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' viewBox='0 0 400 225'%3E%3Crect width='400' height='225' fill='%234ade80'/%3E%3Ctext x='200' y='100' text-anchor='middle' dy='.3em' fill='white' font-family='system-ui' font-size='32'%3E🏟️%3C/text%3E%3Ctext x='200' y='140' text-anchor='middle' dy='.3em' fill='white' font-family='system-ui' font-size='14'%3E" + encodeURIComponent(turf.name) + "%3C/text%3E%3C/svg%3E";
              }}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-green-400 via-green-500 to-green-600 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-4xl mb-2">🏟️</div>
                <div className="text-sm font-medium">{turf.name}</div>
              </div>
            </div>
          )}
          
          {/* Overlay badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-1">
            {turf.isPopular && (
              <Badge className="bg-accent-500 text-white shadow-sm">Popular</Badge>
            )}
            {turf.hasLights && (
              <Badge className="bg-yellow-500 text-white shadow-sm">Lights</Badge>
            )}
          </div>

          {/* Heart/Favorite button - placeholder */}
          <div className="absolute top-3 right-3">
            <button
              className="w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors"
              aria-label={`Add ${turf.name} to favorites`}
            >
              <span className="text-gray-600">♡</span>
            </button>
          </div>

          {/* Next available time */}
          {turf.nextAvailable && (
            <div className="absolute bottom-3 left-3">
              <Badge className="bg-white/90 text-gray-800 shadow-sm backdrop-blur-sm">
                <Clock className="w-3 h-3 mr-1" />
                Next: {turf.nextAvailable}
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="p-4 space-y-3">
          {/* Header: Name, Rating, Distance */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg text-gray-900 truncate">
                {turf.name}
              </h3>
              <button
                className="flex items-center text-sm text-gray-600 gap-1 mt-1 hover:text-primary-600 transition-colors group"
                onClick={(e) => {
                  e.stopPropagation();
                  // Create Google Maps URL with coordinates if available, otherwise use address
                  const mapsUrl = turf.coords 
                    ? `https://maps.google.com/maps?q=${turf.coords.lat},${turf.coords.lng}&z=15`
                    : `https://maps.google.com/maps/dir//${encodeURIComponent(turf.address)}`;
                  window.open(mapsUrl, '_blank');
                  track('whatsapp_cta_clicked', { action: 'google_maps', context: 'turf_card', turf_id: turf.id });
                }}
                title="Open in Google Maps"
              >
                <MapPin className="w-4 h-4 flex-shrink-0 group-hover:text-primary-600" />
                <span className="truncate group-hover:underline">{turf.address}</span>
              </button>
              {typeof turf.distanceKm === 'number' && (
                <div className="text-xs text-gray-500 mt-1">
                  {turf.distanceKm.toFixed(1)} km away
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-1 ml-3">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-sm">{Number(turf.rating).toFixed(1)}</span>
              <span className="text-xs text-gray-500">({turf.totalReviews})</span>
            </div>
          </div>

          {/* Amenities */}
          {turf.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {turf.amenities.slice(0, 4).map((amenity) => (
                <Badge 
                  key={amenity} 
                  variant="secondary" 
                  className="text-xs rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  {getAmenityIcon(amenity)}
                  {getAmenityIcon(amenity) ? (
                    <span className="ml-1">{amenity}</span>
                  ) : (
                    amenity
                  )}
                </Badge>
              ))}
              {turf.amenities.length > 4 && (
                <Badge variant="outline" className="text-xs rounded-full">
                  +{turf.amenities.length - 4} more
                </Badge>
              )}
            </div>
          )}

          {/* Next available slots */}
          {turf.nextAvailable && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Next available:
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge 
                  variant="outline" 
                  className="text-xs rounded-full border-green-200 text-green-700 bg-green-50"
                >
                  {turf.nextAvailable}
                </Badge>
                {/* Show 2 more upcoming slots if available */}
                {turf.slots && turf.slots.length > 0 && turf.slots.slice(0, 2).map((slot, idx) => (
                  <Badge 
                    key={idx}
                    variant="outline" 
                    className="text-xs rounded-full border-blue-200 text-blue-700 bg-blue-50"
                  >
                    {slot}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Price and CTA */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <div className="font-semibold text-lg text-gray-900">
                {turf.priceDisplay}
              </div>
              <div className="text-xs text-gray-500">All-inclusive</div>
            </div>
            
            <div className="flex items-center gap-2">
              {user ? (
                <>
                  {turf.contacts?.phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCallClick}
                      className="hidden sm:flex"
                    >
                      <Phone className="w-4 h-4 mr-1" />
                      Call
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    className="bg-primary-600 hover:bg-primary-700 text-white"
                    onClick={handleBookClick}
                  >
                    <Calendar className="w-4 h-4 mr-2 sm:mr-1" />
                    <span className="hidden sm:inline">Book</span> Now
                  </Button>
                </>
              ) : (
                <div className="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border">
                  Sign in to book this turf
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
          // Could add success toast here
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