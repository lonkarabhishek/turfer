import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, LocateFixed, Filter } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { TurfCard } from './TurfCard';
import { turfsAPI, type Turf, type User } from '../lib/api';

interface TurfSearchProps {
  user: User | null;
  currentCity?: string;
  onTurfClick?: (turfId: string) => void;
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function TurfSearch({ currentCity = 'your city', onTurfClick }: TurfSearchProps) {
  const [query, setQuery] = useState('');
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  
  // Search filters
  const [filters, setFilters] = useState({
    sport: '',
    priceMin: '',
    priceMax: '',
    rating: '',
  });

  // Load turfs on mount and when filters change
  useEffect(() => {
    loadTurfs();
  }, [query, filters]);

  const loadTurfs = async () => {
    setLoading(true);
    setError('');
    
    try {
      const params: any = {
        query: query || undefined,
        sport: filters.sport || undefined,
        priceMin: filters.priceMin ? Number(filters.priceMin) : undefined,
        priceMax: filters.priceMax ? Number(filters.priceMax) : undefined,
        rating: filters.rating ? Number(filters.rating) : undefined,
        limit: 20,
      };

      const response = await turfsAPI.search(params);
      
      if (response.success && response.data) {
        setTurfs(response.data.turfs);
      } else {
        setError(response.error || 'Failed to load turfs');
        setTurfs([]);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setTurfs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadTurfs();
  };

  const handleLocate = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          // Store user location for distance calculations
          setUserLocation({ lat, lng });
          
          try {
            const response = await turfsAPI.getNearby(lat, lng, 10);
            
            if (response.success && response.data) {
              setTurfs(response.data);
              setQuery('');
              setFilters({ sport: '', priceMin: '', priceMax: '', rating: '' });
            }
          } catch (err) {
            console.error('Error loading nearby turfs:', err);
            // If nearby API fails, just reload all turfs with distance
            loadTurfs();
          }
        },
        (error) => {
          alert('Unable to get your location. Please enable location services.');
          console.error('Geolocation error:', error);
        }
      );
    } else {
      alert('Geolocation is not supported by this browser.');
    }
  };

  const displayTurfs = useMemo(() => {
    const transformedTurfs = turfs.map(turf => ({
      id: turf.id,
      name: turf.name,
      address: turf.address,
      rating: turf.rating,
      totalReviews: turf.totalReviews,
      pricePerHour: turf.pricePerHour,
      pricePerHourMin: turf.pricePerHour,
      pricePerHourWeekend: turf.pricePerHourWeekend,
      priceDisplay: turf.pricePerHourWeekend 
        ? `₹${turf.pricePerHour}–₹${turf.pricePerHourWeekend}/hr`
        : `₹${turf.pricePerHour}/hr`,
      amenities: turf.amenities,
      images: turf.images,
      slots: ['06 AM - 07 AM', '07 AM - 08 AM', '08 PM - 09 PM', '09 PM - 10 PM'], // Mock slots for now
      contacts: turf.contactInfo,
      coords: turf.coordinates,
      distanceKm: turf.coordinates && userLocation 
        ? calculateDistance(userLocation.lat, userLocation.lng, turf.coordinates.lat, turf.coordinates.lng) 
        : Math.random() * 5, // Fallback to mock distance
      nextAvailable: '06 AM - 07 AM',
      isPopular: turf.rating >= 4.5,
      hasLights: turf.amenities.some(a => a.toLowerCase().includes('light')),
    }));

    // Sort by distance when user location is available
    if (userLocation) {
      return transformedTurfs.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    }

    // Otherwise sort by rating and popularity
    return transformedTurfs.sort((a, b) => {
      if (a.isPopular && !b.isPopular) return -1;
      if (!a.isPopular && b.isPopular) return 1;
      return (b.rating || 0) - (a.rating || 0);
    });
  }, [turfs, userLocation]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Search Bar */}
      <div className="mb-6">
        <motion.div 
          className="bg-white rounded-2xl shadow-airbnb border p-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-0">
            <Input 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder={`Search turfs, areas, or amenities in ${currentCity}…`}
              className="border-0 focus-visible:ring-0 text-base flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button 
              className="bg-primary-600 hover:bg-primary-700 hidden sm:flex" 
              onClick={handleSearch}
              disabled={loading}
            >
              <Search className="w-4 h-4 mr-2"/>Search
            </Button>
          </div>
          
          {/* Mobile action buttons */}
          <div className="flex items-center gap-2 sm:hidden">
            <Button variant="outline" size="sm" onClick={handleLocate} className="flex-1">
              <LocateFixed className="w-4 h-4 mr-1"/>Near me
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} className="flex-1">
              <Filter className="w-4 h-4 mr-1"/>Filters
            </Button>
          </div>
          
          {/* Desktop action buttons */}
          <div className="hidden sm:flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleLocate}>
                <LocateFixed className="w-4 h-4 mr-2"/>Near me
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)}>
                <Filter className="w-4 h-4 mr-2"/>Filters
              </Button>
            </div>
          </div>

          {/* Filters */}
          {filtersOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Sport</label>
                <select
                  value={filters.sport}
                  onChange={(e) => setFilters(prev => ({ ...prev, sport: e.target.value }))}
                  className="w-full text-sm border rounded-md p-2"
                >
                  <option value="">Any Sport</option>
                  <option value="Football">Football</option>
                  <option value="Cricket">Cricket</option>
                  <option value="Tennis">Tennis</option>
                  <option value="Basketball">Basketball</option>
                </select>
              </div>
              
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Min Price</label>
                <input
                  type="number"
                  value={filters.priceMin}
                  onChange={(e) => setFilters(prev => ({ ...prev, priceMin: e.target.value }))}
                  placeholder="₹500"
                  className="w-full text-sm border rounded-md p-2"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Max Price</label>
                <input
                  type="number"
                  value={filters.priceMax}
                  onChange={(e) => setFilters(prev => ({ ...prev, priceMax: e.target.value }))}
                  placeholder="₹1000"
                  className="w-full text-sm border rounded-md p-2"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Min Rating</label>
                <select
                  value={filters.rating}
                  onChange={(e) => setFilters(prev => ({ ...prev, rating: e.target.value }))}
                  className="w-full text-sm border rounded-md p-2"
                >
                  <option value="">Any Rating</option>
                  <option value="4.5">4.5+ Stars</option>
                  <option value="4.0">4.0+ Stars</option>
                  <option value="3.5">3.5+ Stars</option>
                </select>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Results */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {query ? `Search results for "${query}"` : `Turfs in ${currentCity}`}
            </h3>
            <p className="text-sm text-gray-600">
              {loading ? 'Searching...' : `${turfs.length} turfs found`}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2" 
              onClick={loadTurfs}
            >
              Try Again
            </Button>
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                <div className="h-48 bg-gray-200 rounded-lg mb-4" />
                <div className="h-4 bg-gray-200 rounded mb-2" />
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {displayTurfs.map((turf) => (
              <TurfCard 
                key={turf.id} 
                turf={turf} 
                variant="default" 
                onClick={() => onTurfClick?.(turf.id)}
              />
            ))}
          </div>
        )}

        {!loading && !error && turfs.length === 0 && (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No turfs found</h3>
            <p className="text-gray-500 mb-4">
              Try adjusting your search criteria or browse all available turfs
            </p>
            <Button onClick={() => {
              setQuery('');
              setFilters({ sport: '', priceMin: '', priceMax: '', rating: '' });
              loadTurfs();
            }}>
              Show All Turfs
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}