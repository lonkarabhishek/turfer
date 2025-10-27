import { supabase, gameHelpers, turfHelpers, gameRequestHelpers, notificationHelpers } from './supabase';

// API configuration and client
const API_BASE_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002/api');

console.log('🔗 API Base URL:', API_BASE_URL);
console.log('🌍 Environment:', import.meta.env.MODE);
console.log('🏗️ Production?', import.meta.env.PROD);

// Types for API responses
export interface ApiResponse<T = unknown> {
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
  profile_image_url?: string;
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
  operatingHours: Record<string, unknown>;
  contactInfo: Record<string, unknown>;
  gmap_embed_link?: string;
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
  private initialized = false;

  constructor() {
    this.initFromStorage();
  }

  private initFromStorage() {
    if (typeof window !== 'undefined' && !this.initialized) {
      // Load from localStorage on init
      this.token = localStorage.getItem('auth_token');
      const userStr = localStorage.getItem('auth_user');
      this.user = userStr ? JSON.parse(userStr) : null;
      this.initialized = true;
    }
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
    this.initFromStorage();
    return this.token;
  }

  getUser() {
    this.initFromStorage();
    return this.user;
  }

  isAuthenticated() {
    this.initFromStorage();
    return !!this.token && !!this.user;
  }

  isOwner() {
    return this.user?.role === 'owner' || this.user?.role === 'admin';
  }
}

export const authManager = new AuthManager();


// API client with auth headers
async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Get Supabase session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

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
    throw error;
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
    try {
      const { data, error } = await turfHelpers.searchTurfs(params);
      if (error) {
        return { success: false, error };
      }
      
      // Format response to match SearchTurfsResponse
      const response: SearchTurfsResponse = {
        turfs: data || [],
        total: data?.length || 0,
        page: params.page || 1,
        limit: params.limit || 10,
        totalPages: Math.ceil((data?.length || 0) / (params.limit || 10))
      };
      
      return { success: true, data: response };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getById(id: string): Promise<ApiResponse<Turf>> {
    try {
      const { data, error } = await turfHelpers.getTurfById(id);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getNearby(lat: number, lng: number, radius: number = 10): Promise<ApiResponse<Turf[]>> {
    // This would need geolocation queries in Supabase - return empty for now
    return { success: true, data: [] };
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
  } = {}): Promise<ApiResponse<unknown[]>> {
    try {
      const { data, error } = await gameHelpers.getAvailableGames(params);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getGameById(gameId: string): Promise<ApiResponse<unknown>> {
    try {
      const { data, error } = await gameHelpers.getGameById(gameId);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async joinGame(gameId: string): Promise<ApiResponse<unknown>> {
    try {
      const { data, error } = await gameRequestHelpers.sendJoinRequest(gameId);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async createGame(gameData: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    try {
      const { data, error } = await gameHelpers.createGame(gameData as any);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getMyGames(): Promise<ApiResponse<unknown[]>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }
      
      const { data, error } = await gameHelpers.getUserGames(user.id);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getJoinedGames(): Promise<ApiResponse<any[]>> {
    // This would require a helper function to be implemented
    return { success: true, data: [] };
  },

  async getUserGames(userId: string): Promise<ApiResponse<any[]>> {
    try {
      const { data, error } = await gameHelpers.getUserGames(userId);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Game request system
  async requestToJoin(gameId: string, note?: string): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await gameRequestHelpers.sendJoinRequest(gameId, note);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getGameRequests(gameId: string): Promise<ApiResponse<any[]>> {
    try {
      const { data, error } = await gameRequestHelpers.getGameRequests(gameId);
      if (error) {
        return { success: false, error };
      }
      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getMyRequests(): Promise<ApiResponse<any[]>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }
      
      // This function doesn't exist yet, return empty array
      const data: any[] = [];
      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async acceptRequest(requestId: string, gameId: string): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await gameRequestHelpers.acceptRequest(requestId, gameId);
      if (error) {
        return { success: false, error };
      }

      // Create notification for the accepted user
      if (data && data.user_id) {
        await notificationHelpers.createNotification(
          data.user_id,
          'game_request_accepted',
          'Request Accepted! 🎉',
          'Your request to join the game has been accepted. Get ready to play!',
          { gameId, requestId }
        );
      }

      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async rejectRequest(requestId: string, gameId: string): Promise<ApiResponse<any>> {
    try {
      const { data, error } = await gameRequestHelpers.rejectRequest(requestId, gameId);
      if (error) {
        return { success: false, error };
      }

      // Create notification for the rejected user (optional, might be annoying)
      if (data && data.user_id) {
        await notificationHelpers.createNotification(
          data.user_id,
          'game_request_rejected',
          'Request Update',
          'Your request to join the game was not accepted. Keep looking for other games!',
          { gameId, requestId }
        );
      }

      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
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

  async getOwnerBookings(ownerId: string): Promise<ApiResponse<any[]>> {
    return apiRequest(`/bookings/owner/${ownerId}`);
  },

  async getUserBookings(userId: string): Promise<ApiResponse<any[]>> {
    return apiRequest(`/bookings/user/${userId}`);
  },
};