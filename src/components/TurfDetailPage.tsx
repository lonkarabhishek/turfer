import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  MapPin, Star, Clock, Users, Wifi, Car, WashingMachine, 
  Coffee, Shield, Phone, ArrowLeft, ChevronLeft, 
  ChevronRight, Plus
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

const amenityIcons: Record<string, React.ComponentType<any>> = {
  'parking': Car,
  'wifi': Wifi,
  'washroom': WashingMachine,
  'canteen': Coffee,
  'security': Shield,
  'changing_room': Users
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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availability, setAvailability] = useState<TurfAvailability[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [bookingStep, setBookingStep] = useState<'select' | 'confirm' | 'success'>('select');
  const [bookingLoading, setBookingLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (turfId) {
        await loadTurfDetails();
        await loadAvailability();
      }
    };
    loadData();
  }, [turfId]);

  useEffect(() => {
    if (turfId) {
      loadAvailability();
    }
  }, [selectedDate]);

  const loadTurfDetails = async () => {
    setLoading(true);
    try {
      const response = await turfsAPI.getById(turfId);
      if (response.success && response.data) {
        const turf = response.data;
        const transformedTurf = {
          ...turf,
          priceDisplay: `₹${turf.pricePerHour}/hr`,
          slots: [],
          contacts: turf.contactInfo
        };
        setTurf(transformedTurf);
      }
    } catch (error) {
      console.error('Error loading turf details:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async () => {
    try {
      // Generate 7 days of availability starting from selected date
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(selectedDate);
        date.setDate(selectedDate.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }

      // For demo purposes, generate mock availability
      // In a real app, this would come from the backend
      const mockAvailability: TurfAvailability[] = dates.map(date => ({
        date,
        slots: timeSlots.map(time => ({
          time,
          available: Math.random() > 0.3, // 70% availability
          price: turf?.pricePerHour || 100,
          bookedBy: Math.random() > 0.7 ? 'Another User' : undefined
        }))
      }));

      setAvailability(mockAvailability);
    } catch (error) {
      console.error('Error loading availability:', error);
    }
  };

  const handleDateChange = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    if (direction === 'prev') {
      newDate.setDate(selectedDate.getDate() - 7);
    } else {
      newDate.setDate(selectedDate.getDate() + 7);
    }
    setSelectedDate(newDate);
  };

  const handleSlotToggle = (date: string, timeSlot: string) => {
    const slotKey = `${date}-${timeSlot}`;
    setSelectedSlots(prev => 
      prev.includes(slotKey) 
        ? prev.filter(s => s !== slotKey)
        : [...prev, slotKey]
    );
  };

  const handleBooking = async () => {
    if (!isAuthenticated() || selectedSlots.length === 0) return;

    setBookingLoading(true);
    try {
      // Group slots by date
      const slotsByDate = selectedSlots.reduce((acc, slotKey) => {
        const [date, time] = slotKey.split('-');
        if (!acc[date]) acc[date] = [];
        acc[date].push(time);
        return acc;
      }, {} as Record<string, string[]>);

      // Create bookings for each date
      for (const [date, slots] of Object.entries(slotsByDate)) {
        for (const timeSlot of slots) {
          const [startTime, endTime] = timeSlot.split('-');
          
          await bookingsAPI.createBooking({
            turfId,
            date,
            startTime,
            endTime,
            totalPlayers: 1,
            totalAmount: turf?.pricePerHour || 100,
            notes: `Booked via turf detail page`
          });
        }
      }

      setBookingStep('success');
      setSelectedSlots([]);
      loadAvailability(); // Refresh availability
    } catch (error) {
      console.error('Booking error:', error);
    } finally {
      setBookingLoading(false);
    }
  };

  const getTotalCost = () => {
    return selectedSlots.length * (turf?.pricePerHour || 100);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-IN', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <motion.div 
        className="bg-white shadow-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="bg-primary-600 text-white p-4 flex items-center gap-4">
          <Button variant="ghost" onClick={onBack} className="text-white hover:bg-primary-700">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{turf?.name || 'Loading...'}</h2>
            {turf && (
              <p className="text-primary-200 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {turf.address}
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
              {/* Turf Info */}
              {turf && (
                <>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-4">
                      {/* Image Gallery */}
                      {turf.images && turf.images.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 rounded-lg overflow-hidden">
                          {turf.images.slice(0, 4).map((image, index) => (
                            <img
                              key={index}
                              src={image}
                              alt={`${turf.name} ${index + 1}`}
                              className="w-full h-32 object-cover"
                            />
                          ))}
                        </div>
                      )}

                      {/* Description */}
                      {(turf as any).description && (
                        <Card>
                          <CardHeader>
                            <CardTitle>About this venue</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-gray-600">{(turf as any).description}</p>
                          </CardContent>
                        </Card>
                      )}

                      {/* Sports */}
                      <Card>
                        <CardHeader>
                          <CardTitle>Available Sports</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {((turf as any).sports || []).map((sport: string) => (
                              <Badge key={sport} variant="secondary">
                                {sport}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Amenities */}
                      {turf.amenities && turf.amenities.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Amenities</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {turf.amenities.map((amenity) => {
                                const IconComponent = amenityIcons[amenity] || Shield;
                                return (
                                  <div key={amenity} className="flex items-center gap-2">
                                    <IconComponent className="w-4 h-4 text-primary-600" />
                                    <span className="text-sm capitalize">
                                      {amenity.replace('_', ' ')}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                      {/* Quick Info */}
                      <Card>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Star className="w-4 h-4 text-yellow-500" />
                            <span className="font-medium">{turf.rating || 'New'}</span>
                            {turf.totalReviews && (
                              <span className="text-gray-500">({turf.totalReviews} reviews)</span>
                            )}
                          </div>
                          
                          <div className="text-2xl font-bold text-primary-600">
                            {turf.priceDisplay}
                          </div>

                          {turf.contacts?.phone && (
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="w-4 h-4" />
                              <span>{turf.contacts.phone}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4" />
                            <span>
                              {(turf as any).operatingHours?.open || '6:00 AM'} - {(turf as any).operatingHours?.close || '10:00 PM'}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Action Buttons */}
                      <div className="space-y-2">
                        <Button 
                          onClick={() => onCreateGame?.()}
                          className="w-full bg-primary-600 hover:bg-primary-700"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create Game Here
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => setBookingStep('confirm')}
                          disabled={selectedSlots.length === 0}
                        >
                          Book Directly ({selectedSlots.length} slots)
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Availability Calendar */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Availability</CardTitle>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDateChange('prev')}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-sm font-medium">
                            {formatDate(availability[0]?.date)} - {formatDate(availability[6]?.date)}
                          </span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDateChange('next')}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <div className="grid grid-cols-8 gap-2 min-w-[800px]">
                          {/* Header */}
                          <div className="font-medium text-sm text-gray-600 py-2">Time</div>
                          {availability.map((day) => (
                            <div key={day.date} className="font-medium text-sm text-gray-600 py-2 text-center">
                              {formatDate(day.date)}
                            </div>
                          ))}

                          {/* Time slots */}
                          {timeSlots.map((time) => (
                            <React.Fragment key={time}>
                              <div className="text-sm py-1 px-2 border-r">{time}</div>
                              {availability.map((day) => {
                                const slot = day.slots.find(s => s.time === time);
                                const slotKey = `${day.date}-${time}`;
                                const isSelected = selectedSlots.includes(slotKey);
                                
                                return (
                                  <button
                                    key={`${day.date}-${time}`}
                                    onClick={() => slot?.available && handleSlotToggle(day.date, time)}
                                    disabled={!slot?.available}
                                    className={`
                                      text-xs p-1 rounded transition-colors
                                      ${!slot?.available 
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                        : isSelected
                                          ? 'bg-primary-600 text-white'
                                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                                      }
                                    `}
                                  >
                                    {slot?.available ? (
                                      isSelected ? '✓' : '₹' + slot.price
                                    ) : (
                                      slot?.bookedBy ? 'Booked' : 'N/A'
                                    )}
                                  </button>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      {selectedSlots.length > 0 && (
                        <div className="mt-4 p-4 bg-primary-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">Selected {selectedSlots.length} slots</div>
                              <div className="text-sm text-gray-600">
                                Total: ₹{getTotalCost()}
                              </div>
                            </div>
                            <Button
                              onClick={() => setSelectedSlots([])}
                              variant="outline"
                              size="sm"
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

        {/* Booking Confirmation Modal */}
        {bookingStep === 'confirm' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Card className="w-96">
              <CardHeader>
                <CardTitle>Confirm Booking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="font-medium">{selectedSlots.length} time slots</div>
                  <div className="text-sm text-gray-600">at {turf?.name}</div>
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex justify-between font-medium">
                    <span>Total Amount:</span>
                    <span>₹{getTotalCost()}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setBookingStep('select')}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleBooking}
                    disabled={bookingLoading}
                    className="flex-1"
                  >
                    {bookingLoading ? 'Booking...' : 'Confirm Booking'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </motion.div>
    </div>
  );
}