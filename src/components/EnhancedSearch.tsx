import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MapPin, Clock, Users, DollarSign } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { parseSmartQuery, createFilterChips, removeFilterChip, buildSearchSuggestions, type FilterChip } from '../lib/smartSearch';
import { analytics } from '../lib/analytics';

interface EnhancedSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string, filters: Record<string, any>) => void;
  placeholder?: string;
}

export function EnhancedSearch({ 
  value, 
  onChange, 
  onSearch, 
  placeholder = "Search turfs, or try: 'Tonight 7pm near Govind Nagar'"
}: EnhancedSearchProps) {
  const [chips, setChips] = useState<FilterChip[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update suggestions based on input
  useEffect(() => {
    if (isTyping) {
      const newSuggestions = buildSearchSuggestions(value);
      setSuggestions(newSuggestions);
    }
  }, [value, isTyping]);

  // Parse query and create chips when user stops typing
  useEffect(() => {
    if (!isTyping && value.trim()) {
      const parsedQuery = parseSmartQuery(value);
      const newChips = createFilterChips(parsedQuery);
      setChips(newChips);
    }
  }, [value, isTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsTyping(true);
    setShowSuggestions(true);
    
    // Clear typing state after user stops typing
    setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };

  const handleSearch = () => {
    if (value.trim()) {
      const parsedQuery = parseSmartQuery(value);
      analytics.searchSubmitted(value, { 
        has_filters: Object.keys(parsedQuery.filters).length > 0,
        filter_count: Object.keys(parsedQuery.filters).length,
        ...parsedQuery.filters
      });
      onSearch(value, parsedQuery.filters);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    setShowSuggestions(false);
    setTimeout(() => handleSearch(), 100);
  };

  const handleRemoveChip = (chipId: string) => {
    const newChips = removeFilterChip(chips, chipId);
    setChips(newChips);
    
    // Remove the corresponding filter from the search query
    const parsedQuery = parseSmartQuery(value);
    const chipType = chips.find(c => c.id === chipId)?.type;
    if (chipType) {
      delete parsedQuery.filters[chipType];
      // You might want to reconstruct the query text without the removed filter
      analytics.filterApplied('remove', chipType);
    }
  };

  const getChipIcon = (type: string) => {
    switch (type) {
      case 'area': return <MapPin className="w-3 h-3" />;
      case 'time': return <Clock className="w-3 h-3" />;
      case 'players': return <Users className="w-3 h-3" />;
      case 'budget': return <DollarSign className="w-3 h-3" />;
      default: return null;
    }
  };

  const getChipColor = (type: string) => {
    switch (type) {
      case 'date': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'time': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'area': return 'bg-green-100 text-green-700 border-green-200';
      case 'format': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'budget': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'players': return 'bg-pink-100 text-pink-700 border-pink-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="relative w-full">
      {/* Search Input */}
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            } else if (e.key === 'Escape') {
              setShowSuggestions(false);
            }
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder={placeholder}
          className="pr-10 border-0 focus-visible:ring-0 text-base"
          aria-label="Smart search"
        />
        <Button
          onClick={handleSearch}
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2 bg-primary-600 hover:bg-primary-700 h-8"
        >
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {/* Filter Chips */}
      <AnimatePresence>
        {chips.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-wrap gap-2 mt-3"
          >
            {chips.map((chip) => (
              <motion.div
                key={chip.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                layout
              >
                <Badge
                  className={`${getChipColor(chip.type)} flex items-center gap-1 pr-1`}
                  variant="outline"
                >
                  {getChipIcon(chip.type)}
                  <span className="text-xs">{chip.label}</span>
                  {chip.removable && (
                    <button
                      onClick={() => handleRemoveChip(chip.id)}
                      className="ml-1 hover:bg-black/10 rounded-full p-0.5"
                      aria-label={`Remove ${chip.label} filter`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </Badge>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions Dropdown */}
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 z-50 mt-2 bg-white rounded-lg shadow-airbnb border"
          >
            <div className="p-2 border-b border-gray-100">
              <span className="text-xs font-medium text-gray-500">Suggestions</span>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <Search className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700">{suggestion}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop to close suggestions */}
      {showSuggestions && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowSuggestions(false)}
        />
      )}
    </div>
  );
}