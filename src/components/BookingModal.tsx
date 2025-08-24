import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, Clock, MapPin, CreditCard, 
  CheckCircle, AlertCircle, Plus, Minus
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { bookingsAPI, authManager } from '../lib/api';
import { paymentManager, type PaymentRequest } from '../lib/payments';
import { useToast } from './ui/toast';

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  turf: any; // Turf data
  onBookingSuccess?: (booking: any) => void;
}

type BookingStep = 'datetime' | 'details' | 'payment' | 'confirmation';

export function BookingModal({ open, onClose, turf, onBookingSuccess }: BookingModalProps) {
  const [step, setStep] = useState<BookingStep>('datetime');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'venue' | 'online'>('venue');
  const [bookingData, setBookingData] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '',
    endTime: '',
    totalPlayers: 1,
    notes: '',
    totalAmount: 0
  });

  const user = authManager.getUser();
  const pricePerHour = turf?.pricePerHour || 500;
  const { success } = useToast();

  if (!open) return null;

  const timeSlots = [
    '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00'
  ];

  const calculateAmount = () => {
    if (!bookingData.startTime || !bookingData.endTime) return 0;
    
    const start = parseInt(bookingData.startTime.split(':')[0]);
    const end = parseInt(bookingData.endTime.split(':')[0]);
    const duration = end - start;
    
    if (duration <= 0) return 0;
    
    const amount = duration * pricePerHour;
    setBookingData(prev => ({ ...prev, totalAmount: amount }));
    return amount;
  };

  const handleTimeChange = (type: 'start' | 'end', time: string) => {
    setBookingData(prev => ({
      ...prev,
      [type === 'start' ? 'startTime' : 'endTime']: time
    }));
    
    // Auto-calculate end time if start time is selected
    if (type === 'start' && !bookingData.endTime) {
      const startHour = parseInt(time.split(':')[0]);
      const endHour = Math.min(startHour + 1, 22);
      setBookingData(prev => ({
        ...prev,
        endTime: `${endHour.toString().padStart(2, '0')}:00`
      }));
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      setError('Please sign in to book a turf');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // Handle online payment
      if (paymentMethod === 'online') {
        const paymentRequest: PaymentRequest = {
          amount: paymentManager.convertToSmallestUnit(bookingData.totalAmount),
          currency: 'INR',
          orderId: `booking_${turf.id}_${Date.now()}`,
          description: `Turf booking at ${turf.name}`,
          customerEmail: user.email,
          customerPhone: user.phone,
          metadata: {
            turfId: turf.id,
            bookingDate: bookingData.date,
            startTime: bookingData.startTime,
            endTime: bookingData.endTime
          }
        };

        const paymentResult = await paymentManager.processPayment(paymentRequest);
        
        if (!paymentResult.success) {
          setError(paymentResult.error || 'Payment failed. Please try again.');
          setLoading(false);
          return;
        }

        success('Payment successful! Creating your booking...');
      }

      // Create the booking
      const response = await bookingsAPI.createBooking({
        turfId: turf.id,
        date: bookingData.date,
        startTime: bookingData.startTime,
        endTime: bookingData.endTime,
        totalPlayers: bookingData.totalPlayers,
        totalAmount: bookingData.totalAmount,
        notes: bookingData.notes
      });

      if (response.success && response.data) {
        setStep('confirmation');
        onBookingSuccess?.(response.data);
        success(paymentMethod === 'online' ? 'Booking confirmed with payment!' : 'Booking confirmed!');
      } else {
        setError(response.error || 'Booking failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderDateTimeStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Select Date & Time</h3>
        
        {/* Date Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
          <Input
            type="date"
            value={bookingData.date}
            onChange={(e) => setBookingData(prev => ({ ...prev, date: e.target.value }))}
            min={new Date().toISOString().split('T')[0]}
            className="w-full"
          />
        </div>

        {/* Time Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
            <select
              value={bookingData.startTime}
              onChange={(e) => handleTimeChange('start', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select start time</option>
              {timeSlots.map(time => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
            <select
              value={bookingData.endTime}
              onChange={(e) => handleTimeChange('end', e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select end time</option>
              {timeSlots.map(time => (
                <option 
                  key={time} 
                  value={time}
                  disabled={bookingData.startTime && time <= bookingData.startTime}
                >
                  {time}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Duration & Price Preview */}
        {bookingData.startTime && bookingData.endTime && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-800">
                  Duration: {parseInt(bookingData.endTime.split(':')[0]) - parseInt(bookingData.startTime.split(':')[0])} hour(s)
                </p>
                <p className="text-lg font-semibold text-blue-900">
                  Total: ₹{calculateAmount().toLocaleString()}
                </p>
              </div>
              <div className="text-blue-600">
                <Clock className="w-8 h-8" />
              </div>
            </div>
          </div>
        )}
      </div>

      <Button 
        onClick={() => setStep('details')}
        className="w-full bg-primary-600 hover:bg-primary-700"
        disabled={!bookingData.startTime || !bookingData.endTime || !bookingData.date}
      >
        Continue to Details
      </Button>
    </div>
  );

  const renderDetailsStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Booking Details</h3>
        
        {/* Player Count */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Number of Players</label>
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBookingData(prev => ({ ...prev, totalPlayers: Math.max(1, prev.totalPlayers - 1) }))}
              disabled={bookingData.totalPlayers <= 1}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="text-xl font-medium w-8 text-center">{bookingData.totalPlayers}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBookingData(prev => ({ ...prev, totalPlayers: Math.min(22, prev.totalPlayers + 1) }))}
              disabled={bookingData.totalPlayers >= 22}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Special Notes (Optional)
          </label>
          <textarea
            value={bookingData.notes}
            onChange={(e) => setBookingData(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Any special requirements or notes..."
            className="w-full p-3 border border-gray-300 rounded-lg resize-none"
            rows={3}
          />
        </div>

        {/* Booking Summary */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <h4 className="font-semibold mb-3">Booking Summary</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Date:</span>
              <span className="font-medium">{new Date(bookingData.date).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Time:</span>
              <span className="font-medium">{bookingData.startTime} - {bookingData.endTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Players:</span>
              <span className="font-medium">{bookingData.totalPlayers}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
              <span className="font-semibold">Total Amount:</span>
              <span className="font-bold text-primary-600">₹{bookingData.totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex space-x-3">
        <Button 
          variant="outline"
          onClick={() => setStep('datetime')}
          className="flex-1"
        >
          Back
        </Button>
        <Button 
          onClick={() => setStep('payment')}
          className="flex-1 bg-primary-600 hover:bg-primary-700"
        >
          Continue to Payment
        </Button>
      </div>
    </div>
  );

  const renderPaymentStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Payment</h3>
        
        {/* Payment Summary */}
        <div className="border rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">Final Amount</h4>
            <span className="text-2xl font-bold text-primary-600">₹{bookingData.totalAmount.toLocaleString()}</span>
          </div>
          
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Base price ({parseInt(bookingData.endTime.split(':')[0]) - parseInt(bookingData.startTime.split(':')[0])} hr × ₹{pricePerHour})</span>
              <span>₹{bookingData.totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Platform fee</span>
              <span>₹0</span>
            </div>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="space-y-3">
          <h4 className="font-medium">Payment Method</h4>
          
          <div className="space-y-2">
            <div 
              className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                paymentMethod === 'venue' 
                  ? 'border-primary-200 bg-primary-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setPaymentMethod('venue')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-4 h-4 border-2 rounded-full mr-3 ${
                    paymentMethod === 'venue' 
                      ? 'border-primary-600 bg-primary-600' 
                      : 'border-gray-300'
                  }`}></div>
                  <div>
                    <div className="font-medium">Pay at Venue</div>
                    <div className="text-sm text-gray-600">Pay cash at the turf</div>
                  </div>
                </div>
                {paymentMethod === 'venue' && <Badge variant="success">Selected</Badge>}
              </div>
            </div>
            
            {paymentManager.isPaymentEnabled() && (
              <div 
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  paymentMethod === 'online' 
                    ? 'border-primary-200 bg-primary-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setPaymentMethod('online')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-4 h-4 border-2 rounded-full mr-3 ${
                      paymentMethod === 'online' 
                        ? 'border-primary-600 bg-primary-600' 
                        : 'border-gray-300'
                    }`}></div>
                    <div>
                      <div className="font-medium">Online Payment</div>
                      <div className="text-sm text-gray-600">
                        {paymentManager.getAvailableGateways().includes('razorpay') && 'UPI/Cards/Wallets'}
                        {paymentManager.getAvailableGateways().includes('stripe') && ' Credit/Debit Cards'}
                      </div>
                    </div>
                  </div>
                  {paymentMethod === 'online' && (
                    <div className="flex items-center space-x-1">
                      <Badge variant="secondary">Instant</Badge>
                      <CreditCard className="w-4 h-4 text-primary-600" />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {!paymentManager.isPaymentEnabled() && (
              <div className="border border-gray-200 rounded-lg p-3 opacity-60">
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-gray-300 rounded-full mr-3"></div>
                  <div>
                    <div className="font-medium">Online Payment</div>
                    <div className="text-sm text-gray-600">Currently unavailable</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Terms */}
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
          <p>By proceeding, you agree to our terms and conditions. Cancellation is allowed up to 2 hours before the booking time.</p>
        </div>
      </div>

      <div className="flex space-x-3">
        <Button 
          variant="outline"
          onClick={() => setStep('details')}
          className="flex-1"
        >
          Back
        </Button>
        <Button 
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {loading ? (
            <div className="flex items-center">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Booking...
            </div>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Confirm Booking
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderConfirmationStep = () => (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="w-8 h-8 text-green-600" />
      </div>
      
      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">Booking Confirmed!</h3>
        <p className="text-gray-600">Your turf has been successfully booked.</p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-green-700">Booking ID:</span>
            <span className="font-medium text-green-900">#TB{Date.now().toString().slice(-6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-700">Date & Time:</span>
            <span className="font-medium text-green-900">
              {new Date(bookingData.date).toLocaleDateString()} | {bookingData.startTime} - {bookingData.endTime}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-700">Amount:</span>
            <span className="font-bold text-green-900">₹{bookingData.totalAmount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-green-700">Payment:</span>
            <span className="font-medium text-green-900">
              {paymentMethod === 'online' ? 'Paid Online' : 'Pay at Venue'}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Please arrive 10 minutes before your booking time. Contact the turf owner if you need to make any changes.
        </p>
        
        <Button
          onClick={() => {
            onClose();
            setStep('datetime');
            setBookingData({
              date: new Date().toISOString().split('T')[0],
              startTime: '',
              endTime: '',
              totalPlayers: 1,
              notes: '',
              totalAmount: 0
            });
          }}
          className="w-full bg-primary-600 hover:bg-primary-700"
        >
          Done
        </Button>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (step) {
      case 'datetime':
        return renderDateTimeStep();
      case 'details':
        return renderDetailsStep();
      case 'payment':
        return renderPaymentStep();
      case 'confirmation':
        return renderConfirmationStep();
      default:
        return renderDateTimeStep();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{turf?.name || 'Book Turf'}</h2>
              {turf?.address && (
                <div className="flex items-center text-sm text-gray-600 mt-1">
                  <MapPin className="w-4 h-4 mr-1" />
                  {turf.address}
                </div>
              )}
            </div>
            <Button variant="ghost" onClick={onClose} className="p-2">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Progress Indicator */}
          {step !== 'confirmation' && (
            <div className="flex items-center mt-4 space-x-2">
              {['datetime', 'details', 'payment'].map((stepName, index) => (
                <div
                  key={stepName}
                  className={`flex-1 h-2 rounded-full ${
                    stepName === step ? 'bg-primary-600' :
                    ['datetime', 'details', 'payment'].indexOf(step) > index ? 'bg-primary-200' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              {error}
            </div>
          )}

          {renderStep()}
        </div>
      </motion.div>
    </div>
  );
}