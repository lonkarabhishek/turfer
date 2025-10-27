import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle, XCircle, Clock, Calendar, MapPin, Users,
  IndianRupee, Phone, Mail, MessageCircle, Eye, Building2
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { demoDataManager, type DemoBooking, type DemoUser, type DemoTurf } from '../lib/demoData';
import { toastManager } from '../lib/toastManager';

interface DemoOwnerDashboardProps {
  user: DemoUser;
}

export function DemoOwnerDashboard({ user }: DemoOwnerDashboardProps) {
  const [bookings, setBookings] = useState<DemoBooking[]>([]);
  const [turfs, setTurfs] = useState<DemoTurf[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'pending' | 'confirmed' | 'all'>('pending');

  useEffect(() => {
    loadData();
  }, [user.id]);

  const loadData = () => {
    const ownerBookings = demoDataManager.getOwnerBookings(user.id);
    const ownerTurfs = demoDataManager.getOwnerTurfs(user.id);
    setBookings(ownerBookings);
    setTurfs(ownerTurfs);
  };

  const handleApproveBooking = async (bookingId: string) => {
    setLoading(true);
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const updatedBooking = demoDataManager.updateBooking(bookingId, {
        status: 'confirmed'
      });

      if (updatedBooking) {
        loadData(); // Refresh data

        const turf = getTurfById(updatedBooking.turfId);
        const formattedDate = formatDate(updatedBooking.date);
        const timeRange = `${formatTime(updatedBooking.startTime)} - ${formatTime(updatedBooking.endTime)}`;

        // Notify owner
        toastManager.successWithAction(
          'Booking Approved! ✅',
          'The customer has been notified of the confirmation.',
          'View Details'
        );

        // Simulate customer notification (in real app, this would be handled by backend)
        setTimeout(() => {
          toastManager.bookingConfirmed(
            turf?.name || 'Turf',
            formattedDate,
            timeRange
          );
        }, 1000);
      }
    } catch (error) {
      toastManager.error('Error', 'Failed to approve booking');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    setLoading(true);
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const updatedBooking = demoDataManager.updateBooking(bookingId, {
        status: 'cancelled'
      });

      if (updatedBooking) {
        loadData(); // Refresh data

        const turf = getTurfById(updatedBooking.turfId);
        const formattedDate = formatDate(updatedBooking.date);
        const timeRange = `${formatTime(updatedBooking.startTime)} - ${formatTime(updatedBooking.endTime)}`;

        toastManager.info('Booking Rejected', 'The customer has been notified.');

        // Simulate customer notification (in real app, this would be handled by backend)
        setTimeout(() => {
          toastManager.bookingRejected(
            turf?.name || 'Turf',
            formattedDate,
            timeRange,
            'The owner declined your booking request. Please try booking a different time slot.'
          );
        }, 1000);
      }
    } catch (error) {
      toastManager.error('Error', 'Failed to reject booking');
    } finally {
      setLoading(false);
    }
  };

  const getTurfById = (turfId: string) => {
    return turfs.find(t => t.id === turfId);
  };

  const getBookingsByStatus = () => {
    switch (selectedTab) {
      case 'pending':
        return bookings.filter(b => b.status === 'pending');
      case 'confirmed':
        return bookings.filter(b => b.status === 'confirmed');
      default:
        return bookings;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const filteredBookings = getBookingsByStatus();
  const pendingCount = bookings.filter(b => b.status === 'pending').length;
  const confirmedCount = bookings.filter(b => b.status === 'confirmed').length;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Owner Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user.name}!</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Turf Owner</div>
          <div className="font-medium text-gray-900">{turfs.length} Active Turf{turfs.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-600">{pendingCount}</div>
                <div className="text-sm text-gray-600">Pending Approvals</div>
              </div>
              <Clock className="w-8 h-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">{confirmedCount}</div>
                <div className="text-sm text-gray-600">Confirmed Bookings</div>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-600">{turfs.length}</div>
                <div className="text-sm text-gray-600">Active Turfs</div>
              </div>
              <Building2 className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  ₹{bookings.reduce((sum, b) => b.status === 'confirmed' ? sum + b.totalAmount : sum, 0).toLocaleString()}
                </div>
                <div className="text-sm text-gray-600">Total Earnings</div>
              </div>
              <IndianRupee className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bookings Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Booking Requests</CardTitle>
            <div className="flex gap-2">
              <Button
                variant={selectedTab === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTab('pending')}
              >
                Pending ({pendingCount})
              </Button>
              <Button
                variant={selectedTab === 'confirmed' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTab('confirmed')}
              >
                Confirmed ({confirmedCount})
              </Button>
              <Button
                variant={selectedTab === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTab('all')}
              >
                All ({bookings.length})
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {selectedTab === 'pending' ? 'No Pending Requests' :
                 selectedTab === 'confirmed' ? 'No Confirmed Bookings' : 'No Bookings Yet'}
              </h3>
              <p className="text-gray-600">
                {selectedTab === 'pending'
                  ? 'New booking requests will appear here for your approval.'
                  : 'Bookings will appear here once customers make requests.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBookings.map(booking => {
                const turf = getTurfById(booking.turfId);
                return (
                  <motion.div
                    key={booking.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1">
                            Booking Request
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            Customer ID: {booking.userId}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {turf?.name || 'Unknown Turf'}
                            </div>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {formatDate(booking.date)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <Badge
                          variant={
                            booking.status === 'pending' ? 'secondary' :
                            booking.status === 'confirmed' ? 'default' :
                            'outline'
                          }
                        >
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                        </Badge>
                        <div className="text-lg font-bold text-gray-900 mt-1">
                          ₹{booking.totalAmount.toLocaleString()}
                        </div>
                        <div className="text-xs text-green-600">
                          Payment: {booking.paymentStatus}
                        </div>
                      </div>
                    </div>

                    {booking.notes && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Customer Note:</span> {booking.notes}
                        </p>
                      </div>
                    )}

                    <div className="border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                          Booking ID: {booking.id.slice(0, 8)}...
                        </div>

                        {booking.status === 'pending' && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRejectBooking(booking.id)}
                              disabled={loading}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleApproveBooking(booking.id)}
                              disabled={loading}
                              loading={loading}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                          </div>
                        )}

                        {booking.status === 'confirmed' && (
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <MessageCircle className="w-4 h-4 mr-1" />
                              Message
                            </Button>
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              View Details
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* My Turfs Section */}
      <Card>
        <CardHeader>
          <CardTitle>My Turfs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {turfs.map(turf => (
              <div key={turf.id} className="border border-gray-200 rounded-xl overflow-hidden">
                <img
                  src={turf.images[0]}
                  alt={turf.name}
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{turf.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">{turf.address.split(',')[0]}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">⭐ {turf.rating}</Badge>
                      <span className="text-sm text-gray-500">({turf.totalReviews})</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-emerald-600">
                        ₹{turf.pricePerHour}/hr
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}