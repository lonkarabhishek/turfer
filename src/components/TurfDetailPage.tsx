import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Star, Clock, Users, Wifi, Car, WashingMachine, 
  Coffee, Shield, Phone, ArrowLeft, ChevronLeft, 
  ChevronRight, Plus, Heart, Share2, Calendar, 
  CheckCircle, X, PlayCircle, Image as ImageIcon
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { turfsAPI, bookingsAPI } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import type { TurfData } from './TurfCard';

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
  const { isAuthenticated } = useAuth();
  const [turf, setTurf] = useState<TurfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availability, setAvailability] = useState<TurfAvailability[]>([]);
  const [isLiked, setIsLiked] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    loadTurf();
    loadAvailability();
  }, [turfId]);

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
    // Mock availability data - replace with actual API call
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

  const handleBookSlot = async (slot: TimeSlot) => {
    if (!isAuthenticated) {
      alert('Please sign in to book slots');
      return;
    }
    
    setBooking(true);
    try {
      // Implement booking logic
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!turf) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="text-6xl">🏟️</div>
          <div className="text-xl font-semibold text-gray-900">Turf not found</div>
          <Button onClick={onBack} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with back button */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button 
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsLiked(!isLiked)}
              className="rounded-full hover:bg-gray-100"
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full hover:bg-gray-100">
              <Share2 className="w-5 h-5 text-gray-600" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Hero Image Gallery */}
        <div className="relative mb-6 sm:mb-8">
          <motion.div
            className="relative aspect-[21/9] rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-emerald-400 to-emerald-600"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {validImages.length > 0 ? (
              <>
                <img
                  src={validImages[currentImageIndex]}
                  alt={`${turf.name} - Image ${currentImageIndex + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='343' viewBox='0 0 800 343'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2310b981;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23059669;stop-opacity:1' /%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='800' height='343' fill='url(%23grad)'/%3E%3Ctext x='400' y='150' text-anchor='middle' dy='.3em' fill='white' font-family='system-ui' font-size='64' opacity='0.8'%3E🏟️%3C/text%3E%3Ctext x='400' y='220' text-anchor='middle' dy='.3em' fill='white' font-family='system-ui' font-size='24' font-weight='500'%3E${encodeURIComponent(turf.name)}%3C/text%3E%3C/svg%3E`;
                  }}
                />

                {/* Navigation */}
                {hasMultipleImages && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-all duration-200"
                    >
                      <ChevronLeft className="w-6 h-6 text-gray-700" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-all duration-200"
                    >
                      <ChevronRight className="w-6 h-6 text-gray-700" />
                    </button>
                  </>
                )}

                {/* Gallery button */}
                {validImages.length > 1 && (
                  <button
                    onClick={() => setShowImageGallery(true)}
                    className="absolute bottom-6 right-6 bg-white/90 hover:bg-white rounded-full px-4 py-2 shadow-lg transition-all duration-200 flex items-center gap-2"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">View all {validImages.length} photos</span>
                  </button>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="text-8xl mb-4 opacity-80">🏟️</div>
                  <div className="text-3xl font-bold">{turf.name}</div>
                  <div className="text-xl opacity-80 mt-2">Sports Facility</div>
                </div>
              </div>
            )}
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6 lg:space-y-8">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 break-words">{turf.name}</h1>
                  <button
                    className="flex items-center gap-2 text-gray-600 hover:text-emerald-600 transition-colors group w-full sm:w-auto"
                    onClick={() => {
                      const mapsUrl = turf.coords 
                        ? `https://maps.google.com/maps?q=${turf.coords.lat},${turf.coords.lng}&z=15`
                        : `https://maps.google.com/maps/dir//${encodeURIComponent(turf.address)}`;
                      window.open(mapsUrl, '_blank');
                    }}
                  >
                    <MapPin className="w-5 h-5 group-hover:text-emerald-600 flex-shrink-0" />
                    <span className="text-base sm:text-lg group-hover:underline break-words">{turf.address}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 justify-center sm:justify-end flex-shrink-0">
                  <Star className="w-5 h-5 sm:w-6 sm:h-6 fill-yellow-400 text-yellow-400" />
                  <span className="text-xl sm:text-2xl font-bold">{Number(turf.rating).toFixed(1)}</span>
                  <span className="text-gray-500 text-sm sm:text-base">({turf.totalReviews} reviews)</span>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="flex flex-wrap gap-4">
                {turf.isPopular && (
                  <Badge className="bg-gradient-to-r from-orange-500 to-pink-500 text-white px-4 py-2 rounded-full text-sm">
                    ⭐ Popular Choice
                  </Badge>
                )}
                {turf.hasLights && (
                  <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-4 py-2 rounded-full text-sm">
                    💡 Night Play Available
                  </Badge>
                )}
                {turf.distanceKm && (
                  <Badge variant="outline" className="px-4 py-2 rounded-full text-sm border-gray-300">
                    📍 {turf.distanceKm.toFixed(1)}km away
                  </Badge>
                )}
              </div>
            </motion.div>

            {/* Amenities */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Card className="border-0 shadow-lg rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-2xl">Amenities</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {turf.amenities?.filter(amenity => amenity && typeof amenity === 'string').map((amenity) => {
                      const amenityData = amenityIcons[amenity.toLowerCase().replace(/\s+/g, '_')];
                      const IconComponent = amenityData?.icon;
                      
                      return (
                        <div key={amenity} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors">
                          {IconComponent ? (
                            <IconComponent className="w-6 h-6 text-emerald-600" />
                          ) : (
                            <div className="w-6 h-6 bg-emerald-600 rounded-full flex items-center justify-center text-white text-xs">
                              ✓
                            </div>
                          )}
                          <span className="font-medium text-gray-900">
                            {amenityData?.label || amenity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Time Slots */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Card className="border-0 shadow-lg rounded-3xl">
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Calendar className="w-6 h-6" />
                    Available Slots
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {availability.map((day) => (
                    <div key={day.date} className="space-y-4">
                      <h4 className="font-semibold text-lg">Today</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {day.slots.map((slot) => (
                          <button
                            key={slot.time}
                            onClick={() => slot.available && handleBookSlot(slot)}
                            disabled={!slot.available || booking}
                            className={`p-4 rounded-xl text-sm font-medium transition-all duration-200 ${
                              slot.available
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:scale-105 shadow-sm'
                                : 'bg-gray-100 text-gray-500 cursor-not-allowed border border-gray-200'
                            }`}
                          >
                            <div>{slot.time}</div>
                            <div className="text-xs mt-1">
                              {slot.available ? `₹${slot.price}` : 'Booked'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="sticky top-24"
            >
              <Card className="border-0 shadow-xl rounded-3xl overflow-hidden">
                <CardContent className="p-8 space-y-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900 mb-2">
                      {turf.priceDisplay}
                    </div>
                    <div className="text-gray-600">All inclusive pricing</div>
                  </div>

                  <div className="space-y-3">
                    <Button 
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-full py-6 text-lg font-semibold shadow-lg hover:shadow-emerald-200 transition-all duration-200"
                      onClick={() => {
                        // Handle quick booking
                      }}
                    >
                      <Calendar className="w-5 h-5 mr-2" />
                      Book Now
                    </Button>

                    {turf.contacts?.phone && (
                      <Button 
                        variant="outline"
                        className="w-full rounded-full py-6 text-lg font-medium border-2 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50"
                        onClick={() => window.open(`tel:${turf.contacts?.phone}`, '_blank')}
                      >
                        <Phone className="w-5 h-5 mr-2" />
                        Call Owner
                      </Button>
                    )}

                    {onCreateGame && isAuthenticated && (
                      <Button 
                        variant="outline"
                        className="w-full rounded-full py-6 text-lg font-medium border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50"
                        onClick={onCreateGame}
                      >
                        <PlayCircle className="w-5 h-5 mr-2" />
                        Create Game
                      </Button>
                    )}
                  </div>

                  <div className="pt-6 border-t border-gray-200 space-y-3 text-center text-sm text-gray-600">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Instant booking confirmation</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span>Cancel up to 2 hours before</span>
                    </div>
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
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setShowImageGallery(false)}
          >
            <div className="relative max-w-4xl w-full">
              <button
                onClick={() => setShowImageGallery(false)}
                className="absolute -top-12 right-0 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <motion.img
                key={currentImageIndex}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                src={validImages[currentImageIndex]}
                alt={`${turf.name} - Image ${currentImageIndex + 1}`}
                className="w-full h-auto rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              />

              {hasMultipleImages && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {validImages.map((_, index) => (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentImageIndex(index);
                        }}
                        className={`w-3 h-3 rounded-full transition-all duration-200 ${
                          index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                      />
                    ))}
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