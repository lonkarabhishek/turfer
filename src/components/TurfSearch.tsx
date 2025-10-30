import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, LocateFixed, Filter, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Chip } from './ui/chip';
import { Spinner } from './ui/spinner';
import { TurfCard } from './TurfCard';
import { TurfCardEnhanced } from './TurfCardEnhanced';
import { turfsAPI, type Turf, type User } from '../lib/api';
import { formatPriceDisplay, cleanPriceData } from '../lib/priceUtils';
import { extractCoordinatesFromMapUrl, calculateDistance as calcDistance } from '../lib/geolocation';

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

export function TurfSearch({ user, currentCity = 'your city', onTurfClick }: TurfSearchProps) {
  const [query, setQuery] = useState('');
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [sortBy, setSortBy] = useState<'distance' | 'rating' | 'price'>('distance');

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
      // Clean and validate filter parameters
      const params: any = {
        query: query?.trim() || undefined,
        sport: filters.sport?.trim() || undefined,
        priceMin: filters.priceMin && !isNaN(Number(filters.priceMin)) ? Number(filters.priceMin) : undefined,
        priceMax: filters.priceMax && !isNaN(Number(filters.priceMax)) ? Number(filters.priceMax) : undefined,
        rating: filters.rating && !isNaN(Number(filters.rating)) ? Number(filters.rating) : undefined,
        limit: 1000, // Show up to 1000 turfs (effectively all)
      };

      // Remove undefined values to avoid sending them to API
      Object.keys(params).forEach(key => {
        if (params[key] === undefined || params[key] === null || params[key] === '') {
          delete params[key];
        }
      });

      console.log('🔍 Searching turfs with params:', params);
      const response = await turfsAPI.search(params);
      
      if (response.success && response.data) {
        setTurfs(response.data.turfs);
      } else {
        setError(response.error || 'Failed to load turfs');
        setTurfs([]);
      }
    } catch (err) {
      console.error('Error loading turfs:', err);
      setError('Unable to load turfs. Please try again.');
      setTurfs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadTurfs();
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }

    setLocationLoading(true);
    setLocationError('');

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
        } finally {
          setLocationLoading(false);
        }
      },
      (error) => {
        setLocationLoading(false);
        let errorMessage = 'Unable to get your location.';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location services for this site.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable. Please try again.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
        }
        
        setLocationError(errorMessage);
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  };

  const displayTurfs = useMemo(() => {
    // Transform regular turfs from database
    const transformedTurfs = turfs.map(turf => {
      // Extract coordinates from Google Maps embed link
      const gmapLink = (turf as any).gmap_embed_link || (turf as any)['Gmap Embed link'];
      const extractedCoords = gmapLink ? extractCoordinatesFromMapUrl(gmapLink) : null;

      // Use extracted coords or fallback to stored coordinates
      const turfCoords = extractedCoords || turf.coordinates;

      // Calculate distance if we have both user location and turf coordinates
      let distanceKm = null;
      if (userLocation && turfCoords) {
        distanceKm = calcDistance(userLocation, turfCoords);
        console.log(`📍 Distance to ${turf.name}:`, distanceKm, 'km');
      }

      return {
        id: turf.id,
        name: turf.name,
        address: turf.address,
        rating: turf.rating,
        totalReviews: turf.totalReviews,
        ...cleanPriceData({
          pricePerHour: turf.pricePerHour,
          pricePerHourWeekend: turf.pricePerHourWeekend
        }),
        pricePerHourMin: turf.pricePerHour || 500,
        priceDisplay: formatPriceDisplay(turf.pricePerHour, turf.pricePerHourWeekend),
        amenities: turf.amenities,
        images: turf.images,
        slots: ['06 AM - 07 AM', '07 AM - 08 AM', '08 PM - 09 PM', '09 PM - 10 PM'],
        contacts: turf.contactInfo,
        contact_info: turf.contactInfo,
        coords: turfCoords,
        distanceKm,
        nextAvailable: '06 AM - 07 AM',
        isPopular: turf.rating >= 4.5,
        hasLights: turf.amenities?.some(a => a && typeof a === 'string' && a.toLowerCase().includes('light')) || false,
      };
    });

    // Sort based on selected option
    return transformedTurfs.sort((a, b) => {
      switch (sortBy) {
        case 'distance':
          // Sort by distance when user location is available
          if (userLocation) {
            // Put turfs with known distance first, sorted by distance
            if (a.distanceKm !== null && b.distanceKm !== null) {
              return a.distanceKm - b.distanceKm;
            }
            if (a.distanceKm !== null && b.distanceKm === null) return -1;
            if (a.distanceKm === null && b.distanceKm !== null) return 1;
          }
          // If no location, fall back to rating
          return (b.rating || 0) - (a.rating || 0);

        case 'rating':
          // Sort by rating (highest first)
          if (a.rating !== b.rating) {
            return (b.rating || 0) - (a.rating || 0);
          }
          // Then by number of reviews
          return (b.totalReviews || 0) - (a.totalReviews || 0);

        case 'price':
          // Sort by price (lowest first)
          return (a.pricePerHourMin || 0) - (b.pricePerHourMin || 0);

        default:
          return 0;
      }
    });
  }, [turfs, userLocation, sortBy]);

  // Get active filters for chips
  const activeFilters = useMemo(() => {
    const active = [];
    if (filters.sport) active.push({ key: 'sport', label: `Sport: ${filters.sport}`, value: filters.sport });
    if (filters.priceMin) active.push({ key: 'priceMin', label: `Min: ₹${filters.priceMin}`, value: filters.priceMin });
    if (filters.priceMax) active.push({ key: 'priceMax', label: `Max: ₹${filters.priceMax}`, value: filters.priceMax });
    if (filters.rating) active.push({ key: 'rating', label: `Rating: ${filters.rating}+`, value: filters.rating });
    return active;
  }, [filters]);

  const clearFilter = (key: string) => {
    setFilters(prev => ({ ...prev, [key]: '' }));
  };

  const clearAllFilters = () => {
    setFilters({ sport: '', priceMin: '', priceMax: '', rating: '' });
  };

  // Validate price inputs
  const handlePriceChange = (type: 'priceMin' | 'priceMax', value: string) => {
    // Only allow positive integers
    if (value === '' || (/^\d+$/.test(value) && parseInt(value) >= 0)) {
      setFilters(prev => {
        const newFilters = { ...prev, [type]: value };

        // Validate min <= max
        if (type === 'priceMin' && newFilters.priceMax && parseInt(value) > parseInt(newFilters.priceMax)) {
          return prev; // Don't update if min > max
        }
        if (type === 'priceMax' && newFilters.priceMin && parseInt(value) < parseInt(newFilters.priceMin)) {
          return prev; // Don't update if max < min
        }

        return newFilters;
      });
    }
  };

  // Turf click handler
  const handleTurfClick = (turf: any) => {
    // Just navigate to turf detail page for all turfs
    onTurfClick?.(turf.id);
  };

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
          <div className="sm:hidden space-y-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLocate}
                disabled={locationLoading}
                className="flex-1"
              >
                {locationLoading ? <Spinner size="sm" className="mr-1" /> : <LocateFixed className="w-4 h-4 mr-1"/>}
                Near me
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} className="flex-1">
                <Filter className="w-4 h-4 mr-1"/>Filters
                {activeFilters.length > 0 && (
                  <span className="ml-1 bg-primary-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilters.length}
                  </span>
                )}
              </Button>
            </div>
            {/* Mobile sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'distance' | 'rating' | 'price')}
              className="w-full text-sm border rounded-md px-3 py-2 bg-white"
            >
              <option value="distance">Sort by: Distance</option>
              <option value="rating">Sort by: Rating</option>
              <option value="price">Sort by: Price</option>
            </select>
          </div>
          
          {/* Desktop action buttons */}
          <div className="hidden sm:flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLocate}
                disabled={locationLoading}
              >
                {locationLoading ? <Spinner size="sm" className="mr-2" /> : <LocateFixed className="w-4 h-4 mr-2"/>}
                Near me
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)}>
                <Filter className="w-4 h-4 mr-2"/>Filters
                {activeFilters.length > 0 && (
                  <span className="ml-1 bg-primary-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilters.length}
                  </span>
                )}
              </Button>
            </div>

            {/* Sort dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'distance' | 'rating' | 'price')}
                className="text-sm border rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="distance">Distance</option>
                <option value="rating">Rating</option>
                <option value="price">Price</option>
              </select>
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
                  onChange={(e) => handlePriceChange('priceMin', e.target.value)}
                  placeholder="Min ₹/hr"
                  min="0"
                  className="w-full text-sm border rounded-md p-2"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Max Price</label>
                <input
                  type="number"
                  value={filters.priceMax}
                  onChange={(e) => handlePriceChange('priceMax', e.target.value)}
                  placeholder="Max ₹/hr"
                  min="0"
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
        
        {/* Location Error */}
        {locationError && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-amber-800 text-sm">{locationError}</p>
          </div>
        )}
      </div>

      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900">Active Filters</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs"
            >
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <Chip
                key={filter.key}
                variant="primary"
                size="sm"
                onRemove={() => clearFilter(filter.key)}
              >
                {filter.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {query ? `Search results for "${query}"` : `Turfs in ${currentCity}`}
            </h3>
            <p className="text-sm text-gray-600">
              {loading ? 'Searching...' : `${displayTurfs.length} ${displayTurfs.length === 1 ? 'turf' : 'turfs'} found`}
              {activeFilters.length > 0 && !loading && ` with filters applied`}
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
              <TurfCardEnhanced
                key={turf.id}
                turf={turf}
                variant="default"
                onClick={() => handleTurfClick(turf)}
                user={user}
                showStats={true}
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