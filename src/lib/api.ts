// API configuration and client
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

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
    const response = await fetch(url, config);
    
    if (!response.ok) {
      console.error('HTTP error:', response.status, response.statusText);
      return {
        success: false,
        error: `Server error: ${response.status} ${response.statusText}`,
      };
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    return {
      success: false,
      error: 'Network error. Please check your connection.',
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
};