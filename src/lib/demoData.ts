/**
 * Demo data for end-to-end booking flow demonstration
 */

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: 'user' | 'owner' | 'admin';
  isVerified: boolean;
  profile_image_url?: string;
}

export interface DemoTurf {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  coordinates?: { lat: number; lng: number };
  description: string;
  sports: string[];
  amenities: string[];
  images: string[];
  pricePerHour: number;
  pricePerHourWeekend?: number;
  operatingHours: {
    monday: { start: string; end: string };
    tuesday: { start: string; end: string };
    wednesday: { start: string; end: string };
    thursday: { start: string; end: string };
    friday: { start: string; end: string };
    saturday: { start: string; end: string };
    sunday: { start: string; end: string };
  };
  rating: number;
  totalReviews: number;
  isActive: boolean;
  createdAt: string;
}

export interface DemoBooking {
  id: string;
  userId: string;
  turfId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalAmount: number;
  platformFee: number;
  gst: number;
  processingFee: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Demo Users
export const DEMO_USERS: DemoUser[] = [
  {
    id: 'owner-demo-1',
    email: 'owner@turfowner.com',
    name: 'Rajesh Patil',
    phone: '9876543210',
    role: 'owner',
    isVerified: true,
    profile_image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face'
  },
  {
    id: 'user-demo-1',
    email: 'user@player.com',
    name: 'Arjun Sharma',
    phone: '9876543211',
    role: 'user',
    isVerified: true,
    profile_image_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face'
  },
  {
    id: 'user-demo-2',
    email: 'priya@player.com',
    name: 'Priya Desai',
    phone: '9876543212',
    role: 'user',
    isVerified: true,
    profile_image_url: 'https://images.unsplash.com/photo-1494790108755-2616b612b647?w=150&h=150&fit=crop&crop=face'
  },
  {
    id: 'abhisheksoffice11@gmail.com',
    email: 'abhisheksoffice11@gmail.com',
    name: 'Abhishek Lonkar',
    phone: '9876543213',
    role: 'owner',
    isVerified: true,
    profile_image_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face'
  }
];

// Demo Turf by Owner
export const DEMO_TURFS: DemoTurf[] = [
  {
    id: 'demo-turf-1',
    ownerId: 'owner-demo-1',
    name: 'Elite Sports Arena Nashik',
    address: 'Gangapur Road, Near City Pride Theater, Nashik, Maharashtra 422013',
    coordinates: { lat: 19.9975, lng: 73.7898 },
    description: 'Premium artificial turf ground with floodlights and modern facilities. Perfect for football, cricket, and multi-sport activities.',
    sports: ['Football', 'Cricket', 'Hockey'],
    amenities: ['Floodlights', 'Parking', 'Changing Rooms', 'Water', 'First Aid', 'Equipment Rental'],
    images: [
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1579952363873-27d3bfad9c0d?w=800&h=600&fit=crop'
    ],
    pricePerHour: 800,
    pricePerHourWeekend: 1000,
    operatingHours: {
      monday: { start: '06:00', end: '23:00' },
      tuesday: { start: '06:00', end: '23:00' },
      wednesday: { start: '06:00', end: '23:00' },
      thursday: { start: '06:00', end: '23:00' },
      friday: { start: '06:00', end: '23:00' },
      saturday: { start: '06:00', end: '23:00' },
      sunday: { start: '07:00', end: '22:00' }
    },
    rating: 4.8,
    totalReviews: 124,
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-turf-2',
    ownerId: 'abhisheksoffice11@gmail.com',
    name: 'Premium Sports Complex Mumbai',
    address: 'Bandra Kurla Complex, G Block, Mumbai, Maharashtra 400051',
    coordinates: { lat: 19.0596, lng: 72.8656 },
    description: 'State-of-the-art sports facility with premium artificial turf and professional lighting. Ideal for football, cricket, and corporate tournaments.',
    sports: ['Football', 'Cricket', 'Basketball'],
    amenities: ['Floodlights', 'Parking', 'Changing Rooms', 'Water', 'First Aid', 'Equipment Rental', 'Cafeteria', 'AC Waiting Area'],
    images: [
      'https://images.unsplash.com/photo-1579952363873-27d3bfad9c0d?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&h=600&fit=crop'
    ],
    pricePerHour: 1200,
    pricePerHourWeekend: 1500,
    operatingHours: {
      monday: { start: '06:00', end: '23:00' },
      tuesday: { start: '06:00', end: '23:00' },
      wednesday: { start: '06:00', end: '23:00' },
      thursday: { start: '06:00', end: '23:00' },
      friday: { start: '06:00', end: '23:00' },
      saturday: { start: '06:00', end: '23:00' },
      sunday: { start: '07:00', end: '22:00' }
    },
    rating: 4.9,
    totalReviews: 87,
    isActive: true,
    createdAt: new Date().toISOString()
  }
];

// Demo Bookings Storage
export const DEMO_BOOKINGS: DemoBooking[] = [];

/**
 * Demo data management functions
 */
class DemoDataManager {
  private bookings: DemoBooking[] = [...DEMO_BOOKINGS];
  private currentUser: DemoUser | null = null;

  // User Management
  switchToUser(userId: string): DemoUser | null {
    const user = DEMO_USERS.find(u => u.id === userId);
    if (user) {
      this.currentUser = user;
      localStorage.setItem('demo-current-user', JSON.stringify(user));
      return user;
    }
    return null;
  }

  getCurrentUser(): DemoUser | null {
    if (this.currentUser) return this.currentUser;

    const stored = localStorage.getItem('demo-current-user');
    if (stored) {
      this.currentUser = JSON.parse(stored);
      return this.currentUser;
    }

    return null;
  }

  signOut(): void {
    this.currentUser = null;
    localStorage.removeItem('demo-current-user');
  }

  // Turf Management
  getTurfs(): DemoTurf[] {
    return DEMO_TURFS;
  }

  getTurf(turfId: string): DemoTurf | null {
    return DEMO_TURFS.find(t => t.id === turfId) || null;
  }

  getOwnerTurfs(ownerId: string): DemoTurf[] {
    return DEMO_TURFS.filter(t => t.ownerId === ownerId);
  }

  // Booking Management
  getBooking(bookingId: string): DemoBooking | null {
    const booking = DEMO_BOOKINGS.find(b => b.id === bookingId);
    if (booking) return booking;

    // Check localStorage for persisted bookings
    const storedBookings = localStorage.getItem('demo-bookings');
    if (storedBookings) {
      const bookings = JSON.parse(storedBookings);
      return bookings.find((b: DemoBooking) => b.id === bookingId) || null;
    }
    return null;
  }

  createBooking(booking: Omit<DemoBooking, 'id' | 'createdAt' | 'updatedAt'>): DemoBooking {
    const newBooking: DemoBooking = {
      ...booking,
      id: `booking-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.bookings.push(newBooking);
    localStorage.setItem('demo-bookings', JSON.stringify(this.bookings));
    return newBooking;
  }

  updateBooking(bookingId: string, updates: Partial<DemoBooking>): DemoBooking | null {
    const index = this.bookings.findIndex(b => b.id === bookingId);
    if (index === -1) return null;

    this.bookings[index] = {
      ...this.bookings[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem('demo-bookings', JSON.stringify(this.bookings));
    return this.bookings[index];
  }

  getBookings(): DemoBooking[] {
    const stored = localStorage.getItem('demo-bookings');
    if (stored) {
      this.bookings = JSON.parse(stored);
    }
    return this.bookings;
  }

  getUserBookings(userId: string): DemoBooking[] {
    return this.getBookings().filter(b => b.userId === userId);
  }

  getTurfBookings(turfId: string): DemoBooking[] {
    return this.getBookings().filter(b => b.turfId === turfId);
  }

  getOwnerBookings(ownerId: string): DemoBooking[] {
    const ownerTurfs = this.getOwnerTurfs(ownerId);
    const turfIds = ownerTurfs.map(t => t.id);
    return this.getBookings().filter(b => turfIds.includes(b.turfId));
  }

  // Check slot availability
  isSlotAvailable(turfId: string, date: string, startTime: string, endTime: string): boolean {
    const turfBookings = this.getTurfBookings(turfId);

    const conflictingBooking = turfBookings.find(booking => {
      if (booking.date !== date || booking.status === 'cancelled') return false;

      const bookingStart = this.timeToMinutes(booking.startTime);
      const bookingEnd = this.timeToMinutes(booking.endTime);
      const requestStart = this.timeToMinutes(startTime);
      const requestEnd = this.timeToMinutes(endTime);

      // Check for overlap
      return (requestStart < bookingEnd && requestEnd > bookingStart);
    });

    return !conflictingBooking;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Get available slots for a date
  getAvailableSlots(turfId: string, date: string): Array<{time: string; available: boolean; price: number}> {
    const turf = this.getTurf(turfId);
    if (!turf) return [];

    const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;
    const pricePerHour = isWeekend && turf.pricePerHourWeekend ? turf.pricePerHourWeekend : turf.pricePerHour;

    const slots = [];
    for (let hour = 6; hour <= 22; hour++) {
      const startTime = `${hour.toString().padStart(2, '0')}:00`;
      const endTime = `${(hour + 1).toString().padStart(2, '0')}:00`;

      const available = this.isSlotAvailable(turfId, date, startTime, endTime);

      slots.push({
        time: `${startTime} - ${endTime}`,
        available,
        price: pricePerHour
      });
    }

    return slots;
  }
}

export const demoDataManager = new DemoDataManager();

// Helper function to create demo notifications (for testing purposes)
export function createDemoNotifications(userId: string) {
  // This function can be used to create sample notifications for demo purposes
  // For now, it's a placeholder that could integrate with a notification system
  console.log(`Creating demo notifications for user: ${userId}`);

  // In a real implementation, this might create notifications like:
  // - "New booking request received"
  // - "Booking confirmed by turf owner"
  // - "Payment successful"
  // - "Game starting soon"

  // For now, this is just a placeholder function
}