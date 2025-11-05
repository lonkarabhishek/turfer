import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Clock, MapPin, CreditCard, CheckCircle, Calendar,
  AlertCircle, Plus, Minus, IndianRupee, User
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { demoDataManager, type DemoTurf, type DemoUser } from '../lib/demoData';
import { calculateBookingTotal } from '../lib/bookingUtils';
import { toastManager } from '../lib/toastManager';
import { getValidImageUrl } from '../lib/imageUtils';

interface EnhancedBookingModalProps {
  open: boolean;
  onClose: () => void;
  turf: DemoTurf;
  onBookingSuccess?: (booking: any) => void;
  onNavigateToPending?: (bookingId: string) => void;
}

type BookingStep = 'datetime' | 'summary' | 'payment' | 'confirmation';

interface BookingData {
  date: string;
  startTime: string;
  endTime: string;
  totalPlayers: number;
  notes: string;
}

export function EnhancedBookingModal({ open, onClose, turf, onBookingSuccess, onNavigateToPending }: EnhancedBookingModalProps) {
  const [step, setStep] = useState<BookingStep>('datetime');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingData, setBookingData] = useState<BookingData>({
    date: new Date().toISOString().split('T')[0],
    startTime: '20:00', // 8 PM
    endTime: '22:00',   // 10 PM
    totalPlayers: 10,
    notes: ''
  });

  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [availableSlots, setAvailableSlots] = useState<Array<{time: string; available: boolean; price: number}>>([]);
  const [createdBooking, setCreatedBooking] = useState<any>(null);

  useEffect(() => {
    const user = demoDataManager.getCurrentUser();
    setCurrentUser(user);
  }, []);

  useEffect(() => {
    if (bookingData.date) {
      const slots = demoDataManager.getAvailableSlots(turf.id, bookingData.date);
      setAvailableSlots(slots);
    }
  }, [bookingData.date, turf.id]);

  if (!open) return null;

  const calculateAmount = () => {
    try {
      if (!bookingData.startTime || !bookingData.endTime) return 0;

      const start = parseInt(bookingData.startTime.split(':')[0]);
      const end = parseInt(bookingData.endTime.split(':')[0]);
      const duration = end - start;

      if (duration <= 0) return 0;

      const isWeekend = new Date(bookingData.date).getDay() === 0 || new Date(bookingData.date).getDay() === 6;
      const pricePerHour = isWeekend && turf.pricePerHourWeekend ? turf.pricePerHourWeekend : turf.pricePerHour;

      return duration * pricePerHour;
    } catch (error) {
      return 0;
    }
  };

  const isSlotAvailable = () => {
    return demoDataManager.isSlotAvailable(turf.id, bookingData.date, bookingData.startTime, bookingData.endTime);
  };

  const handleTimeChange = (type: 'start' | 'end', time: string) => {
    if (type === 'start') {
      const startHour = parseInt(time.split(':')[0]);
      const endHour = Math.min(startHour + 2, 23); // Default 2-hour booking

      setBookingData(prev => ({
        ...prev,
        startTime: time,
        endTime: `${endHour.toString().padStart(2, '0')}:00`
      }));
    } else {
      setBookingData(prev => ({ ...prev, endTime: time }));
    }
  };

  const handleNext = () => {
    if (step === 'datetime') {
      if (!isSlotAvailable()) {
        setError('Selected time slot is not available. Please choose a different time.');
        return;
      }
      setError('');
      setStep('summary');
    } else if (step === 'summary') {
      setStep('payment');
    }
  };

  const handleBooking = async () => {
    if (!currentUser) {
      toastManager.error('Authentication Required', 'Please switch to a demo user first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Calculate pricing
      const baseAmount = calculateAmount();
      const pricing = calculateBookingTotal(baseAmount);

      // Create booking
      const booking = demoDataManager.createBooking({
        userId: currentUser.id,
        turfId: turf.id,
        date: bookingData.date,
        startTime: bookingData.startTime,
        endTime: bookingData.endTime,
        totalAmount: pricing.totalAmount,
        platformFee: pricing.platformFee,
        gst: pricing.gst,
        processingFee: pricing.processingFee,
        status: 'pending', // Waiting for owner approval
        paymentStatus: 'paid', // Mock payment success
        paymentId: `demo-payment-${Date.now()}`,
        notes: bookingData.notes
      });

      setCreatedBooking(booking);
      onBookingSuccess?.(booking);

      // Show payment success first
      toastManager.paymentSuccess(pricing.totalAmount, booking.id);

      // Show booking pending notification
      setTimeout(() => {
        const formatTime = (time: string) => {
          const [hours, minutes] = time.split(':');
          const hour = parseInt(hours);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
          return `${displayHour}:${minutes} ${ampm}`;
        };

        const formattedDate = new Date(bookingData.date).toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short'
        });
        const timeRange = `${formatTime(bookingData.startTime)} - ${formatTime(bookingData.endTime)}`;

        toastManager.bookingPending(turf.name, formattedDate, timeRange);
      }, 2500);

      setStep('confirmation');

    } catch (err: any) {
      setError(err.message || 'Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const timeSlots = Array.from({ length: 17 }, (_, i) => {
    const hour = i + 6;
    return {
      value: `${hour.toString().padStart(2, '0')}:00`,
      label: `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`
    };
  });

  const baseAmount = calculateAmount();
  const pricing = calculateBookingTotal(baseAmount);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Book Turf</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2">
            {(['datetime', 'summary', 'payment', 'confirmation'] as BookingStep[]).map((s, index) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s ? 'bg-emerald-600 text-white' :
                  ['datetime', 'summary', 'payment', 'confirmation'].indexOf(step) > index ? 'bg-emerald-100 text-emerald-600' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {index + 1}
                </div>
                {index < 3 && (
                  <div className={`w-8 h-0.5 mx-1 ${
                    ['datetime', 'summary', 'payment', 'confirmation'].indexOf(step) > index ? 'bg-emerald-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-96">
          {/* Turf Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-xl">
            <div className="flex items-start gap-3">
              <img
                src={getValidImageUrl(turf.images[0])}
                alt={turf.name}
                className="w-16 h-16 rounded-lg object-cover"
              />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{turf.name}</h3>
                <p className="text-sm text-gray-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {turf.address.split(',')[0]}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    ⭐ {turf.rating}
                  </Badge>
                  <span className="text-sm font-medium text-emerald-600">
                    ₹{turf.pricePerHour}/hr
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Step Content */}
          {step === 'datetime' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Date
                </label>
                <Input
                  type="date"
                  value={bookingData.date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setBookingData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Time
                  </label>
                  <select
                    value={bookingData.startTime}
                    onChange={(e) => handleTimeChange('start', e.target.value)}
                    className="w-full h-12 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {timeSlots.slice(0, -1).map(slot => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Time
                  </label>
                  <select
                    value={bookingData.endTime}
                    onChange={(e) => handleTimeChange('end', e.target.value)}
                    className="w-full h-12 px-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {timeSlots.filter(slot => slot.value > bookingData.startTime).map(slot => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expected Players
                </label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBookingData(prev => ({ ...prev, totalPlayers: Math.max(1, prev.totalPlayers - 1) }))}
                    disabled={bookingData.totalPlayers <= 1}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-lg font-medium w-12 text-center">{bookingData.totalPlayers}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBookingData(prev => ({ ...prev, totalPlayers: Math.min(22, prev.totalPlayers + 1) }))}
                    disabled={bookingData.totalPlayers >= 22}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {!isSlotAvailable() && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">This time slot is not available</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'summary' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Date & Time</span>
                  <span className="font-medium">{bookingData.date} • {bookingData.startTime} - {bookingData.endTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration</span>
                  <span className="font-medium">{parseInt(bookingData.endTime.split(':')[0]) - parseInt(bookingData.startTime.split(':')[0])} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Players</span>
                  <span className="font-medium">{bookingData.totalPlayers} players</span>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Base Amount</span>
                  <span>₹{baseAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Platform Fee</span>
                  <span>₹{pricing.platformFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">GST (18%)</span>
                  <span>₹{pricing.gst.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Processing Fee</span>
                  <span>₹{pricing.processingFee.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>Total Amount</span>
                  <span>₹{pricing.totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Special Notes (Optional)
                </label>
                <textarea
                  value={bookingData.notes}
                  onChange={(e) => setBookingData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none"
                  rows={3}
                  placeholder="Any special requirements or notes for the turf owner..."
                />
              </div>
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-6">
              <div className="text-center p-6 bg-emerald-50 rounded-xl">
                <CreditCard className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-emerald-900 mb-2">Mock Payment</h3>
                <p className="text-emerald-700 text-sm mb-4">
                  In demo mode, payment will be simulated as successful
                </p>
                <div className="text-2xl font-bold text-emerald-900">
                  ₹{pricing.totalAmount.toLocaleString()}
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div className="text-amber-800 text-sm">
                    <p className="font-medium mb-1">Demo Mode Notice</p>
                    <p>No real payment will be processed. This booking will be created with "pending" status, waiting for turf owner approval.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'confirmation' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Booking Request Sent!</h3>
                <p className="text-gray-600">
                  Your booking request has been sent to {turf.name}. You'll receive a confirmation once the owner approves your booking.
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg text-left">
                <p className="text-sm text-blue-800">
                  <strong>Next Steps:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1">
                  <li>• Check your dashboard for booking status updates</li>
                  <li>• The turf owner will review your request</li>
                  <li>• You'll be notified once approved or if any changes are needed</li>
                </ul>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100">
          <div className="flex justify-between">
            {step !== 'datetime' && step !== 'confirmation' && (
              <Button
                variant="outline"
                onClick={() => {
                  if (step === 'summary') setStep('datetime');
                  else if (step === 'payment') setStep('summary');
                }}
              >
                Back
              </Button>
            )}

            <div className="flex gap-3 ml-auto">
              {step !== 'confirmation' && (
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              )}

              {step === 'datetime' && (
                <Button onClick={handleNext} disabled={!isSlotAvailable()}>
                  Continue
                </Button>
              )}

              {step === 'summary' && (
                <Button onClick={handleNext}>
                  Proceed to Payment
                </Button>
              )}

              {step === 'payment' && (
                <Button onClick={handleBooking} loading={loading}>
                  {loading ? 'Processing...' : `Pay ₹${pricing.totalAmount.toLocaleString()}`}
                </Button>
              )}

              {step === 'confirmation' && (
                <>
                  {onNavigateToPending && createdBooking && (
                    <Button
                      onClick={() => {
                        onNavigateToPending(createdBooking.id);
                        onClose();
                      }}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      View Booking Status
                    </Button>
                  )}
                  <Button variant="outline" onClick={onClose}>
                    Done
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}