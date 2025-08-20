import { ChevronDown, User } from 'lucide-react';
// Removed unused Button import
import { Badge } from './ui/badge';
import { motion } from 'framer-motion';
import { track } from '../lib/analytics';

interface TopNavProps {
  currentCity?: string;
  // onCityChange?: (city: string) => void;
  onProfileClick?: () => void;
}

export function TopNav({ 
  currentCity = 'Nashik', 
  onProfileClick 
}: TopNavProps) {
  const cities = ['Nashik', 'Pune', 'Mumbai', 'Kolhapur'];

  const handleCityClick = () => {
    // For now, just show available cities
    const cityList = cities.filter(c => c !== currentCity).join(', ');
    alert(`Coming soon to: ${cityList}! Currently live in ${currentCity} only.`);
    track('location_requested', { context: 'city_picker', current_city: currentCity });
  };

  const handleProfileClick = () => {
    track('assistant_opened'); // Using this as profile click for now
    onProfileClick?.();
  };

  return (
    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100">
      <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Logo and City Picker */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <motion.div 
              className="w-8 h-8 bg-primary-600 rounded-xl flex items-center justify-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="text-white font-bold text-sm">T</span>
            </motion.div>
            <span className="hidden sm:block font-bold text-lg text-gray-900">Turfer</span>
          </div>
          
          {/* City Picker - Prominent on mobile */}
          <motion.button
            onClick={handleCityClick}
            className="flex items-center gap-1 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-full px-3 py-1.5 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-label={`Current city: ${currentCity}. Click to change`}
          >
            <span className="font-semibold text-primary-700 text-sm">{currentCity}</span>
            <ChevronDown className="w-4 h-4 text-primary-600" />
            <Badge className="bg-primary-600 text-white text-xs ml-1 hidden sm:inline-flex">
              Live
            </Badge>
          </motion.button>
        </div>

        {/* Profile/Menu */}
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleProfileClick}
            className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Profile menu"
          >
            <User className="w-4 h-4 text-gray-600" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}