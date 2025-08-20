export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: 'user' | 'owner' | 'admin';
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Turf {
  id: string;
  ownerId: string;
  name: string;
  address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  description?: string;
  sports: string[];
  amenities: string[];
  images: string[];
  pricePerHour: number;
  pricePerHourWeekend?: number;
  operatingHours: {
    [day: string]: {
      open: string;
      close: string;
      isOpen: boolean;
    };
  };
  contactInfo: {
    phone?: string;
    email?: string;
    website?: string;
  };
  rating: number;
  totalReviews: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Booking {
  id: string;
  userId: string;
  turfId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPlayers: number;
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  paymentStatus: 'pending' | 'paid' | 'refunded';
  paymentMethod?: 'cash' | 'online' | 'wallet';
  createdAt: Date;
  updatedAt: Date;
}

export interface Game {
  id: string;
  hostId: string;
  turfId: string;
  date: string;
  startTime: string;
  endTime: string;
  sport: string;
  format: string; // e.g., "5v5", "7v7", "Cricket"
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'all';
  currentPlayers: number;
  maxPlayers: number;
  costPerPerson: number;
  description?: string;
  notes?: string;
  isPrivate: boolean;
  joinRequests: string[]; // user IDs
  confirmedPlayers: string[]; // user IDs
  status: 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id: string;
  userId: string;
  turfId: string;
  bookingId?: string;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface SearchQuery extends PaginationQuery {
  query?: string;
  location?: string;
  sport?: string;
  priceMin?: number;
  priceMax?: number;
  rating?: number;
  amenities?: string[];
}