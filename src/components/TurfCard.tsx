import { motion } from 'framer-motion';
import { MapPin, Star, Clock, Users, Phone, MessageCircle, Wifi, Car, Coffee } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { buildWhatsAppLink, generateBookingMessage } from '../lib/whatsapp';
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
}

export function TurfCard({ turf, onBook, variant = 'default' }: TurfCardProps) {
  const handleBookClick = () => {
    analytics.bookingAttempted(turf.id, turf.nextAvailable || 'TBD', 10);
    
    if (turf.contacts?.phone) {
      const message = generateBookingMessage({
        turfName: turf.name,
        address: turf.address,
        date: 'Today', // Would be dynamic in real app
        slot: turf.nextAvailable || 'Next available',
        players: 10, // Would be from form
        notes: 'Found via Turfer app'
      });

      const whatsappUrl = buildWhatsAppLink({
        phone: turf.contacts.phone,
        text: message
      });

      analytics.whatsappClicked('booking', 'turf_card');
      window.open(whatsappUrl, '_blank');
    }
    
    onBook?.(turf);
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
                const target = e.currentTarget;
                target.style.display = 'none';
                target.parentElement!.innerHTML = `
                  <div class="w-full h-full bg-gradient-to-br from-green-400 via-green-500 to-green-600 flex items-center justify-center">
                    <div class="text-center text-white">
                      <div class="text-4xl mb-2">🏟️</div>
                      <div class="text-sm font-medium">${turf.name}</div>
                    </div>
                  </div>
                `;
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
              <div className="flex items-center text-sm text-gray-600 gap-1 mt-1">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{turf.address}</span>
              </div>
              {typeof turf.distanceKm === 'number' && (
                <div className="text-xs text-gray-500 mt-1">
                  {turf.distanceKm.toFixed(1)} km away
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-1 ml-3">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-medium text-sm">{turf.rating.toFixed(1)}</span>
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

          {/* Popular slots */}
          {turf.slots.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700 flex items-center gap-1">
                <Users className="w-3 h-3" />
                Popular times:
              </div>
              <div className="flex flex-wrap gap-1">
                {turf.slots.slice(0, 3).map((slot) => (
                  <Badge 
                    key={slot}
                    variant="outline" 
                    className="text-xs rounded-full border-primary-200 text-primary-700 bg-primary-50"
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleBookClick();
                }}
              >
                <MessageCircle className="w-4 h-4 mr-2 sm:mr-1" />
                <span className="hidden sm:inline">Book via</span> WhatsApp
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}