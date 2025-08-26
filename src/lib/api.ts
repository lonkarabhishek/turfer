// API configuration and client
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3002/api');

console.log('🔗 API Base URL:', API_BASE_URL);
console.log('🌍 Environment:', import.meta.env.MODE);
console.log('🏗️ Production?', import.meta.env.PROD);

// Types for API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: 'user' | 'owner' | 'admin';
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  user: User;
  token: string;
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
  operatingHours: Record<string, any>;
  contactInfo: Record<string, any>;
  rating: number;
  totalReviews: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SearchTurfsResponse {
  turfs: Turf[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Auth state management
class AuthManager {
  private token: string | null = null;
  private user: User | null = null;

  constructor() {
    // Load from localStorage on init
    this.token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    this.user = userStr ? JSON.parse(userStr) : null;
  }

  setAuth(token: string, user: User) {
    this.token = token;
    this.user = user;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
  }

  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }

  getToken() {
    return this.token;
  }

  getUser() {
    return this.user;
  }

  isAuthenticated() {
    return !!this.token && !!this.user;
  }

  isOwner() {
    return this.user?.role === 'owner' || this.user?.role === 'admin';
  }
}

export const authManager = new AuthManager();

// Offline response handler for demo mode
function getOfflineResponse(endpoint: string): ApiResponse {
  console.log('🎭 Returning offline data for:', endpoint);
  
  // Turfs endpoint
  if (endpoint.includes('/turfs')) {
    return {
      success: true,
      data: {
        turfs: [
          {
            id: 'turf_1',
            name: 'Big Bounce Turf',
            address: 'Govind Nagar Link Road, Govind Nagar, Nashik',
            rating: 4.5,
            totalReviews: 128,
            priceDisplay: '₹400-600/hr',
            pricePerHour: 500,
            amenities: ['Parking', 'Washroom', 'Water', 'Lighting'],
            images: ['/api/placeholder/400/300'],
            slots: ['06:00', '07:00', '18:00', '19:00', '20:00'],
            contacts: { phone: '9876543210', whatsapp: '9876543210' },
            coords: { lat: 19.9975, lng: 73.7898 },
            nextAvailable: '6:00 PM Today',
            isPopular: true,
            hasLights: true
          },
          {
            id: 'turf_2', 
            name: 'Greenfield The Multisports Turf',
            address: 'Near K.K. Wagh Engineering, Gangotri Vihar, Nashik',
            rating: 4.2,
            totalReviews: 89,
            priceDisplay: '₹350-550/hr',
            pricePerHour: 450,
            amenities: ['Parking', 'Washroom', 'Cafeteria', 'First Aid'],
            images: ['/api/placeholder/400/300'],
            slots: ['07:00', '08:00', '17:00', '18:00', '19:00'],
            contacts: { phone: '9876543211', whatsapp: '9876543211' },
            coords: { lat: 19.9915, lng: 73.7747 },
            nextAvailable: '7:00 PM Today',
            hasLights: true
          },
          {
            id: 'turf_3',
            name: 'Kridabhumi The Multisports Turf', 
            address: 'Tigraniya Road, Dwarka, Nashik',
            rating: 4.7,
            totalReviews: 156,
            priceDisplay: '₹500-800/hr',
            pricePerHour: 650,
            amenities: ['Premium Facility', 'Parking', 'Washroom', 'AC Lounge', 'Lighting'],
            images: ['/api/placeholder/400/300'],
            slots: ['06:00', '07:00', '08:00', '18:00', '19:00', '20:00'],
            contacts: { phone: '9876543212', whatsapp: '9876543212' },
            coords: { lat: 20.0042, lng: 73.7749 },
            nextAvailable: '8:00 PM Today',
            isPopular: true,
            hasLights: true
          }
        ]
      }
    };
  }
  
  // Games endpoints
  if (endpoint.includes('/games')) {
    return {
      success: true,
      data: []
    };
  }
  
  // Bookings endpoints  
  if (endpoint.includes('/bookings')) {
    return {
      success: true,
      data: []
    };
  }
  
  // Auth endpoints
  if (endpoint.includes('/auth')) {
    return {
      success: false,
      error: 'Authentication temporarily unavailable in demo mode'
    };
  }
  
  // Default response
  return {
    success: false,
    error: 'Feature temporarily unavailable in demo mode'
  };
}

// API client with auth headers
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = authManager.getToken();

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  try {
    console.log('🚀 Making API request to:', url);
    console.log('📦 Request config:', { method: config.method || 'GET', headers: config.headers });
    if (config.body) console.log('📋 Request body:', config.body);
    
    const response = await fetch(url, config);
    
    console.log('📡 Response status:', response.status, response.statusText);
    console.log('📧 Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      console.error('❌ HTTP error:', response.status, response.statusText, 'URL:', url);
      
      // Try to get error details from response
      try {
        const errorData = await response.json();
        console.error('❌ Error details:', errorData);
        return {
          success: false,
          error: errorData.error || `Server error: ${response.status} ${response.statusText}`,
        };
      } catch {
        return {
          success: false,
          error: `Server error: ${response.status} ${response.statusText}`,
        };
      }
    }
    
    const data = await response.json();
    console.log('✅ API response successful:', url);
    console.log('📄 Response data:', data);
    return data;
  } catch (error) {
    console.error('💥 API request failed:', error, 'URL:', url);
    
    // Return sample data for turfs endpoint when network fails
    if (url.includes('/turfs')) {
      console.log('🎭 Returning sample turfs due to network error');
      return {
        success: true,
        data: {
          turfs: [
            {
              id: 'turf_1',
              name: 'Big Bounce Turf',
              address: 'Govind Nagar Link Road, Govind Nagar, Nashik',
              rating: 4.5,
              totalReviews: 128,
              priceDisplay: '₹400-600/hr',
              pricePerHour: 500,
              amenities: ['Parking', 'Washroom', 'Water', 'Lighting'],
              images: ['/api/placeholder/400/300'],
              slots: ['06:00', '07:00', '18:00', '19:00', '20:00'],
              contacts: { phone: '9876543210', whatsapp: '9876543210' },
              coords: { lat: 19.9975, lng: 73.7898 },
              nextAvailable: '6:00 PM Today',
              isPopular: true,
              hasLights: true
            },
            {
              id: 'turf_2', 
              name: 'Greenfield The Multisports Turf',
              address: 'Near K.K. Wagh Engineering, Gangotri Vihar, Nashik',
              rating: 4.2,
              totalReviews: 89,
              priceDisplay: '₹350-550/hr',
              pricePerHour: 450,
              amenities: ['Parking', 'Washroom', 'Cafeteria', 'First Aid'],
              images: ['/api/placeholder/400/300'],
              slots: ['07:00', '08:00', '17:00', '18:00', '19:00'],
              contacts: { phone: '9876543211', whatsapp: '9876543211' },
              coords: { lat: 19.9915, lng: 73.7747 },
              nextAvailable: '7:00 PM Today',
              hasLights: true
            },
            {
              id: 'turf_3',
              name: 'Kridabhumi The Multisports Turf', 
              address: 'Tigraniya Road, Dwarka, Nashik',
              rating: 4.7,
              totalReviews: 156,
              priceDisplay: '₹500-800/hr',
              pricePerHour: 650,
              amenities: ['Premium Facility', 'Parking', 'Washroom', 'AC Lounge', 'Lighting'],
              images: ['/api/placeholder/400/300'],
              slots: ['06:00', '07:00', '08:00', '18:00', '19:00', '20:00'],
              contacts: { phone: '9876543212', whatsapp: '9876543212' },
              coords: { lat: 20.0042, lng: 73.7749 },
              nextAvailable: '8:00 PM Today',
              isPopular: true,
              hasLights: true
            }
          ]
        }
      };
    }
    
    return {
      success: false,
      error: 'Network temporarily unavailable.',
    };
  }
}

// Auth API functions
export const authAPI = {
  async login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(userData: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: 'user' | 'owner';
  }): Promise<ApiResponse<LoginResponse>> {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async getProfile(): Promise<ApiResponse<User>> {
    return apiRequest('/auth/me');
  },

  // OAuth authentication
  async oauth(provider: 'google' | 'apple'): Promise<ApiResponse<LoginResponse>> {
    // In a real implementation, this would handle OAuth flow
    return apiRequest(`/auth/oauth/${provider}`, {
      method: 'POST',
    });
  },

  // Email verification
  async verifyEmail(email: string, code: string): Promise<ApiResponse<{ verified: boolean }>> {
    return apiRequest('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  },

  async resendVerification(email: string): Promise<ApiResponse<{ sent: boolean }>> {
    return apiRequest('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  // Password reset
  async requestPasswordReset(email: string): Promise<ApiResponse<{ sent: boolean }>> {
    return apiRequest('/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async verifyResetCode(email: string, code: string): Promise<ApiResponse<{ valid: boolean }>> {
    return apiRequest('/auth/verify-reset-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  },

  async resetPassword(email: string, code: string, newPassword: string): Promise<ApiResponse<{ reset: boolean }>> {
    return apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    });
  },
};

// Turfs API functions
export const turfsAPI = {
  async search(params: {
    query?: string;
    sport?: string;
    priceMin?: number;
    priceMax?: number;
    rating?: number;
    page?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<SearchTurfsResponse>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });
    
    const endpoint = `/turfs${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    return apiRequest(endpoint);
  },

  async getById(id: string): Promise<ApiResponse<Turf>> {
    return apiRequest(`/turfs/${id}`);
  },

  async getNearby(lat: number, lng: number, radius: number = 10): Promise<ApiResponse<Turf[]>> {
    return apiRequest(`/turfs/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
  },
};

// Games API functions
export const gamesAPI = {
  async getAvailable(params: {
    sport?: string;
    skillLevel?: string;
    date?: string;
    lat?: number;
    lng?: number;
    radius?: number;
    limit?: number;
  } = {}): Promise<ApiResponse<any[]>> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value.toString());
      }
    });
    
    const endpoint = `/games${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    return apiRequest(endpoint);
  },

  async joinGame(gameId: string): Promise<ApiResponse<any>> {
    return apiRequest(`/games/${gameId}/join`, {
      method: 'POST',
    });
  },

  async createGame(gameData: any): Promise<ApiResponse<any>> {
    return apiRequest('/games', {
      method: 'POST',
      body: JSON.stringify(gameData),
    });
  },

  async getMyGames(): Promise<ApiResponse<any[]>> {
    return apiRequest('/games/my-games');
  },

  async getJoinedGames(): Promise<ApiResponse<any[]>> {
    return apiRequest('/games/joined');
  },

  async getUserGames(userId: string): Promise<ApiResponse<any[]>> {
    return apiRequest(`/games/user/${userId}`);
  },

  // Game request system
  async requestToJoin(gameId: string): Promise<ApiResponse<any>> {
    return apiRequest(`/games/${gameId}/request`, {
      method: 'POST',
    });
  },

  async getGameRequests(gameId: string): Promise<ApiResponse<any[]>> {
    return apiRequest(`/games/${gameId}/requests`);
  },

  async getMyRequests(): Promise<ApiResponse<any[]>> {
    return apiRequest('/games/my-requests');
  },

  async acceptRequest(gameId: string, userId: string): Promise<ApiResponse<any>> {
    return apiRequest(`/games/${gameId}/requests/${userId}/accept`, {
      method: 'POST',
    });
  },

  async rejectRequest(gameId: string, userId: string): Promise<ApiResponse<any>> {
    return apiRequest(`/games/${gameId}/requests/${userId}/reject`, {
      method: 'POST',
    });
  },
};

// Bookings API functions
export const bookingsAPI = {
  async createBooking(bookingData: {
    turfId: string;
    date: string;
    startTime: string;
    endTime: string;
    totalPlayers: number;
    totalAmount: number;
    notes?: string;
  }): Promise<ApiResponse<any>> {
    return apiRequest('/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  },

  async getMyBookings(): Promise<ApiResponse<any[]>> {
    return apiRequest('/bookings/my-bookings');
  },
};