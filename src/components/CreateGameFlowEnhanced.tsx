import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Users, Clock, IndianRupee, MessageCircle, X, Check, Search, MapPin,
  Loader2, Calendar, Trophy, Star, Info, ChevronRight, ChevronLeft,
  Zap, Target, Award, Shield
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { IOSTimePicker } from './IOSTimePicker';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { GameSuccessPage } from './GameSuccessPage';
import { buildWhatsAppLink, generateGameInviteMessage } from '../lib/whatsapp';
import { track } from '../lib/analytics';
import { gamesAPI, turfsAPI } from '../lib/api';
import { formatPriceDisplay } from '../lib/priceUtils';
import { useAuth } from '../hooks/useAuth';
import type { GameData } from './GameCard';
import type { TurfData } from './TurfCard';

interface CreateGameFlowEnhancedProps {
  open: boolean;
  onClose: () => void;
  onGameCreated?: (game: GameData) => void;
  initialTurfId?: string;
}

interface CreateGameData {
  turfId: string;
  date: string;
  startTime: string;
  endTime: string;
  sport: string;
  format: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'all';
  maxPlayers: number;
  costPerPerson: number;
  description?: string;
  notes?: string;
  isPrivate?: boolean;
  turfBooked?: boolean;
}

const gameFormats = [
  { 
    id: 'cricket', 
    label: 'Cricket', 
    players: 16, 
    icon: '🏏',
    color: 'bg-orange-100 border-orange-200 text-orange-800',
    description: 'Full cricket match'
  },
  { 
    id: 'box-cricket', 
    label: 'Box Cricket', 
    players: 12, 
    icon: '🏏',
    color: 'bg-orange-100 border-orange-200 text-orange-800',
    description: 'Indoor cricket'
  },
  { 
    id: '7v7', 
    label: '7v7 Football', 
    players: 14, 
    icon: '⚽',
    color: 'bg-emerald-100 border-emerald-200 text-emerald-800',
    description: 'Full field football'
  },
  { 
    id: '5v5', 
    label: '5v5 Football', 
    players: 10, 
    icon: '⚽',
    color: 'bg-emerald-100 border-emerald-200 text-emerald-800',
    description: 'Small sided games'
  },
  { 
    id: 'tennis', 
    label: 'Tennis', 
    players: 4, 
    icon: '🎾',
    color: 'bg-blue-100 border-blue-200 text-blue-800',
    description: 'Singles or doubles'
  },
  { 
    id: 'basketball', 
    label: 'Basketball', 
    players: 10, 
    icon: '🏀',
    color: 'bg-purple-100 border-purple-200 text-purple-800',
    description: 'Full court game'
  }
];

const skillLevels = [
  { 
    id: 'all', 
    label: 'All Levels', 
    description: 'Everyone welcome',
    icon: Users,
    color: 'bg-gray-100 border-gray-200'
  },
  { 
    id: 'beginner', 
    label: 'Beginner', 
    description: 'New to the sport',
    icon: Target,
    color: 'bg-green-100 border-green-200'
  },
  { 
    id: 'intermediate', 
    label: 'Intermediate', 
    description: 'Some experience',
    icon: Award,
    color: 'bg-yellow-100 border-yellow-200'
  },
  { 
    id: 'advanced', 
    label: 'Advanced', 
    description: 'High skill level',
    icon: Trophy,
    color: 'bg-red-100 border-red-200'
  }
];

const formatToSport = {
  '7v7 Football': 'football',
  '5v5 Football': 'football', 
  'Cricket': 'cricket',
  'Box Cricket': 'cricket',
  'Tennis': 'tennis',
  'Basketball': 'basketball'
};

const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 5; hour < 22; hour++) {
    const startHour = hour.toString().padStart(2, '0');
    const endHour = (hour + 1).toString().padStart(2, '0');
    const period = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const nextPeriod = hour + 1 < 12 ? 'AM' : 'PM';
    const nextDisplayHour = hour + 1 > 12 ? hour + 1 - 12 : hour + 1 === 0 ? 12 : hour + 1;
    
    slots.push({
      value: `${startHour}:00-${endHour}:00 ${period}`,
      label: `${displayHour}:00 ${period} - ${nextDisplayHour}:00 ${nextPeriod}`,
      startTime: `${startHour}:00`,
      endTime: `${endHour}:00`
    });
  }
  return slots;
};

const timeSlots = generateTimeSlots();

export function CreateGameFlowEnhanced({ open, onClose, onGameCreated, initialTurfId }: CreateGameFlowEnhancedProps) {
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableTurfs, setAvailableTurfs] = useState<TurfData[]>([]);
  const [selectedTurf, setSelectedTurf] = useState<TurfData | null>(null);
  const [showTurfSearch, setShowTurfSearch] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<any>(null);
  const [formData, setFormData] = useState({
    date: '',
    timeSlot: '',
    startTime: '',
    endTime: '',
    skillLevel: 'all' as 'beginner' | 'intermediate' | 'advanced' | 'all',
    maxPlayers: 10, // Default value, will be updated when format is selected
    costPerPerson: 0,
    notes: '',
    turfBooked: false
  });
  const [createdGame, setCreatedGame] = useState<any>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setSearchTerm('');
      if (!initialTurfId) {
        setSelectedTurf(null);
      }
      setSelectedFormat(null);
      setShowTurfSearch(false);
      setCreatedGame(null);
      setFormData({
        date: '',
        timeSlot: '',
        startTime: '',
        endTime: '',
        skillLevel: 'all',
        maxPlayers: 10,
        costPerPerson: 0,
        notes: '',
        turfBooked: false
      });
    }
  }, [open, initialTurfId]);

  // Load initial turf if provided
  useEffect(() => {
    if (open && initialTurfId && !selectedTurf) {
      const loadInitialTurf = async () => {
        try {
          const response = await turfsAPI.getById(initialTurfId);
          if (response.success && response.data) {
            const turf = {
              ...response.data,
              priceDisplay: formatPriceDisplay(response.data.pricePerHour),
              slots: [],
              contacts: response.data.contactInfo
            };
            setSelectedTurf(turf);
          }
        } catch (error) {
          console.error('Error loading initial turf:', error);
        }
      };
      loadInitialTurf();
    }
  }, [open, initialTurfId, selectedTurf]);

  // Load default turfs when component mounts and search for turfs when search term changes
  useEffect(() => {
    const searchTurfs = async () => {
      // Load default turfs if no search term, or search based on term
      const searchParams = searchTerm.length >= 2 ? 
        { query: searchTerm, limit: 10 } : 
        { limit: 10 }; // Load top 10 turfs by default

      try {
        const response = await turfsAPI.search(searchParams);
        if (response.success && response.data) {
          const turfs = response.data.turfs || [];
          const transformedTurfs = turfs.map((turf: any) => ({
            ...turf,
            priceDisplay: formatPriceDisplay(turf.pricePerHour),
            slots: [],
            contacts: turf.contactInfo
          }));
          setAvailableTurfs(transformedTurfs);
        }
      } catch (error) {
        console.error('Error searching turfs:', error);
      }
    };

    const debounceTimer = setTimeout(searchTurfs, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  // Load default turfs when venue search modal opens
  useEffect(() => {
    if (showTurfSearch && searchTerm.length === 0) {
      const loadDefaultTurfs = async () => {
        try {
          const response = await turfsAPI.search({ limit: 15 });
          if (response.success && response.data) {
            const turfs = response.data.turfs || [];
            const transformedTurfs = turfs.map((turf: any) => ({
              ...turf,
              priceDisplay: formatPriceDisplay(turf.pricePerHour),
              slots: [],
              contacts: turf.contactInfo
            }));
            setAvailableTurfs(transformedTurfs);
          }
        } catch (error) {
          console.error('Error loading default turfs:', error);
        }
      };
      loadDefaultTurfs();
    }
  }, [showTurfSearch]);

  if (!open) return null;

  // Check if user is authenticated
  if (!isAuthenticated()) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Login Required</h3>
          <p className="text-gray-600 mb-6">You need to be logged in to create a game.</p>
          <Button onClick={onClose} className="w-full">Close</Button>
        </motion.div>
      </div>
    );
  }

  const handleFormatSelect = (format: any) => {
    setSelectedFormat(format);
    // Update maxPlayers to the format's default, but allow customization later
    setFormData(prev => ({ ...prev, maxPlayers: format.players }));
    track('card_viewed', { type: 'game', id: format.id, name: format.label });
    setStep(2);
  };

  const handleNext = () => {
    // Basic validation for step 2
    if (step === 2 && (!selectedTurf || !formData.date || !formData.startTime || !formData.endTime)) {
      setError('Please fill in all required fields');
      return;
    }
    
    if (step < 4) {
      setStep(step + 1);
      setError(null);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setError(null);
    }
  };

  const handleCreateGame = async () => {
    console.log('🎮 Starting handleCreateGame...');
    console.log('selectedTurf:', selectedTurf);
    console.log('user:', user);
    console.log('selectedFormat:', selectedFormat);
    console.log('formData:', formData);
    
    if (!selectedTurf || !user || !selectedFormat) {
      console.error('❌ Missing required information:', { selectedTurf: !!selectedTurf, user: !!user, selectedFormat: !!selectedFormat });
      setError('Missing required information');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('✅ All required data available, proceeding...');

      // Validate time inputs
      if (!formData.startTime || !formData.endTime) {
        throw new Error('Please select start and end times');
      }

      // Prepare game data for backend
      const gameData: CreateGameData = {
        turfId: selectedTurf.id,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        sport: formatToSport[selectedFormat.label as keyof typeof formatToSport] || 'football',
        format: selectedFormat.label,
        skillLevel: formData.skillLevel,
        maxPlayers: formData.maxPlayers,
        costPerPerson: formData.costPerPerson,
        description: `${selectedFormat.label} game at ${selectedTurf.name}`,
        notes: formData.notes || undefined,
        isPrivate: false,
        turfBooked: formData.turfBooked
      };

      // Create game via API
      console.log('📡 Sending game data to API:', gameData);
      const response = await gamesAPI.createGame(gameData as any);
      console.log('📡 API response:', response);
      
      if (!response.success) {
        console.error('❌ API error:', response.error);
        throw new Error(response.error || 'Failed to create game');
      }

      const gameResponse = response.data as any;
      console.log('✅ Game created successfully:', gameResponse);

      // Create GameData for local display/sharing
      const displayGameData: GameData = {
        id: gameResponse.id,
        hostName: user.name,
        hostAvatar: user.profile_image_url || "",
        hostPhone: user.phone || '9999999999',
        turfName: selectedTurf.name,
        turfAddress: selectedTurf.address,
        date: formData.date,
        timeSlot: formData.timeSlot,
        format: selectedFormat.label,
        skillLevel: formData.skillLevel === 'all' ? 'All levels' : 
                   formData.skillLevel.charAt(0).toUpperCase() + formData.skillLevel.slice(1) as any,
        currentPlayers: 1,
        maxPlayers: formData.maxPlayers,
        costPerPerson: formData.costPerPerson,
        notes: formData.notes,
        distanceKm: 0
      };

      setCreatedGame(displayGameData);
      console.log('🎉 Setting created game data:', displayGameData);
      track('create_game_success', { format: selectedFormat.label, turf_id: selectedTurf.id });

      console.log('🚀 Moving to step 4...');
      console.log('🎯 Before setStep(4), current step:', step);
      setStep(4);
      console.log('✅ setStep(4) called, should be step 4 now');
      
      // Call onGameCreated AFTER setting step 4, so modal doesn't close immediately
      onGameCreated?.(displayGameData);

    } catch (error: any) {
      console.error('Create game error:', error);
      setError(error.message || 'Failed to create game. Please try again.');
      track('create_game_failed', { error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = [
    'Choose Sport',
    'Game Details', 
    'Final Setup',
    'Game Created!'
  ];

  const isStepComplete = (stepNum: number) => {
    switch (stepNum) {
      case 1: return !!selectedFormat;
      case 2:
        const isComplete = !!(selectedTurf && formData.date && formData.startTime && formData.endTime);
        console.log('Step 2 validation:', {
          selectedTurf: !!selectedTurf,
          date: !!formData.date,
          startTime: !!formData.startTime,
          endTime: !!formData.endTime,
          isComplete
        });
        return isComplete;
      case 3: return true;
      default: return false;
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div 
          className="bg-white w-full max-w-2xl max-h-[95vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Enhanced Header with Progress */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">Create New Game</h2>
                <p className="text-primary-100">{stepTitles[step - 1]}</p>
              </div>
              <Button variant="ghost" onClick={onClose} className="text-white hover:bg-white/10">
                <X className="w-6 h-6" />
              </Button>
            </div>

            {/* Progress Indicator */}
            <div className="flex items-center space-x-2">
              {[1, 2, 3, 4].map((stepNum) => (
                <div key={stepNum} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    stepNum < step ? 'bg-white text-primary-600' :
                    stepNum === step ? 'bg-primary-300 text-primary-800' :
                    'bg-primary-800 text-primary-300'
                  }`}>
                    {stepNum < step ? <Check className="w-4 h-4" /> : stepNum}
                  </div>
                  {stepNum < 4 && (
                    <div className={`w-8 h-1 mx-2 rounded-full transition-all ${
                      stepNum < step ? 'bg-white' : 'bg-primary-800'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Step 1: Choose Format - Enhanced */}
            {step === 1 && (
              <motion.div 
                className="p-6"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="mb-6 text-center">
                  <h3 className="text-2xl font-bold mb-2">What's your game?</h3>
                  <p className="text-gray-600">Choose the sport you want to organize</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {gameFormats.map((format, index) => (
                    <motion.button
                      key={format.id}
                      onClick={() => handleFormatSelect(format)}
                      className={`relative overflow-hidden p-6 border-2 rounded-xl transition-all duration-200 hover:scale-105 hover:shadow-lg ${format.color}`}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center space-x-4">
                        <div className="text-4xl">{format.icon}</div>
                        <div className="text-left">
                          <div className="font-bold text-lg">{format.label}</div>
                          <div className="text-sm opacity-75">{format.description}</div>
                          <div className="text-xs mt-1 font-medium">
                            Up to {format.players} players
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 opacity-50" />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Game Details - Enhanced */}
            {step === 2 && (
              <motion.div 
                className="p-6 space-y-6"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">When & Where?</h3>
                  <p className="text-gray-600">Set your game date, time and venue</p>
                </div>

                {/* Selected Format Display */}
                {selectedFormat && (
                  <div className={`p-4 rounded-xl border-2 ${selectedFormat.color} mb-6`}>
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{selectedFormat.icon}</span>
                      <div>
                        <div className="font-semibold">{selectedFormat.label}</div>
                        <div className="text-sm opacity-75">{selectedFormat.players} players max</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Date and Time Selection */}
                <div className="space-y-4">
                  <div>
                    <Label className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4" />
                      Date *
                    </Label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      min={new Date().toISOString().split('T')[0]}
                      className="h-12 text-base"
                      style={{
                        colorScheme: 'light'
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4" />
                        Start Time *
                      </Label>
                      <select
                        value={formData.startTime || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Auto-populate end time with +1 hour
                          const [hour, minute] = value.split(':').map(Number);
                          const endHour = (hour + 1) % 24;
                          const endTime = `${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                          setFormData(prev => ({ ...prev, startTime: value, endTime }));
                        }}
                        className="w-full border border-gray-300 rounded-lg h-12 px-3 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all bg-white text-base"
                      >
                        <option value="">Select time</option>
                        {Array.from({ length: 24 }, (_, i) => i).flatMap(hour => [
                          { value: `${hour.toString().padStart(2, '0')}:00`, label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'AM' : 'PM'}` },
                          { value: `${hour.toString().padStart(2, '0')}:30`, label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:30 ${hour < 12 ? 'AM' : 'PM'}` }
                        ]).map(time => (
                          <option key={time.value} value={time.value}>{time.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4" />
                        End Time *
                      </Label>
                      <select
                        value={formData.endTime || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg h-12 px-3 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all bg-white text-base"
                        disabled={!formData.startTime}
                      >
                        <option value="">Select time</option>
                        {formData.startTime && Array.from({ length: 24 }, (_, i) => i).flatMap(hour => [
                          { value: `${hour.toString().padStart(2, '0')}:00`, label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? 'AM' : 'PM'}` },
                          { value: `${hour.toString().padStart(2, '0')}:30`, label: `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:30 ${hour < 12 ? 'AM' : 'PM'}` }
                        ]).filter(time => {
                          // Filter to show times after start time and within 5 hours maximum (300 minutes)
                          const [startHour, startMinute] = formData.startTime.split(':').map(Number);
                          const [timeHour, timeMinute] = time.value.split(':').map(Number);
                          const startInMinutes = startHour * 60 + startMinute;
                          const timeInMinutes = timeHour * 60 + timeMinute;
                          return timeInMinutes > startInMinutes && timeInMinutes <= startInMinutes + 300;
                        }).map(time => (
                          <option key={time.value} value={time.value}>{time.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Venue Selection */}
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4" />
                    Venue *
                  </Label>
                  
                  {selectedTurf ? (
                    <div className="border-2 border-primary-300 bg-primary-50 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-lg">{selectedTurf.name}</div>
                          <div className="text-gray-600 text-sm mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {selectedTurf.address}
                          </div>
                          <div className="text-primary-600 font-semibold mt-2">
                            {selectedTurf.priceDisplay}
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedTurf(null);
                            setShowTurfSearch(true);
                          }}
                        >
                          Change
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full h-16 text-left justify-start border-dashed border-2"
                      onClick={() => setShowTurfSearch(true)}
                    >
                      <Search className="w-5 h-5 mr-3 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-700">Search for a venue</div>
                        <div className="text-sm text-gray-500">Find turfs, sports complexes, and more</div>
                      </div>
                    </Button>
                  )}
                </div>

                {/* Skill Level Selection */}
                <div>
                  <Label className="mb-3 block">Skill Level</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {skillLevels.map((level) => {
                      const IconComponent = level.icon;
                      return (
                        <button
                          key={level.id}
                          onClick={() => setFormData(prev => ({ ...prev, skillLevel: level.id as any }))}
                          className={`p-4 border-2 rounded-xl transition-all text-left ${
                            formData.skillLevel === level.id
                              ? 'border-primary-300 bg-primary-50'
                              : `${level.color} hover:border-gray-300`
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <IconComponent className="w-5 h-5" />
                            <div>
                              <div className="font-medium">{level.label}</div>
                              <div className="text-xs text-gray-600">{level.description}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Venue Search Modal */}
                {showTurfSearch && (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
                    >
                      <div className="p-6 border-b flex-shrink-0">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-semibold">Find Your Venue</h3>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setShowTurfSearch(false)}
                          >
                            <X className="w-5 h-5" />
                          </Button>
                        </div>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <Input
                            placeholder="Search venues by name or location..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 h-12"
                            autoFocus
                          />
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-y-auto">
                        {availableTurfs.length > 0 ? (
                          availableTurfs.map((turf) => (
                            <button
                              key={turf.id}
                              onClick={() => {
                                setSelectedTurf(turf);
                                setShowTurfSearch(false);
                                setSearchTerm('');
                              }}
                              className="w-full p-4 text-left hover:bg-gray-50 border-b transition-colors"
                            >
                              <div className="font-semibold">{turf.name}</div>
                              <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" />
                                {turf.address}
                              </div>
                              <div className="text-sm text-primary-600 font-medium mt-2">
                                {turf.priceDisplay}
                              </div>
                            </button>
                          ))
                        ) : searchTerm.length >= 2 ? (
                          <div className="p-6 text-center text-gray-500">
                            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p>No venues found for "{searchTerm}"</p>
                            <p className="text-sm">Try a different search term</p>
                          </div>
                        ) : (
                          <div className="p-6 text-center text-gray-500">
                            <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p>Start typing to search venues...</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Final Setup - Enhanced */}
            {step === 3 && (
              <motion.div 
                className="p-6 space-y-6"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">Final Details</h3>
                  <p className="text-gray-600">Set cost and add any special notes</p>
                </div>

                {/* Game Summary Card */}
                <div className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl p-6 border border-primary-200">
                  <h4 className="font-semibold mb-4 text-primary-900">Game Summary</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Sport:</span>
                      <span className="font-medium">{selectedFormat?.label}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Date & Time:</span>
                      <span className="font-medium">{formData.date} • {timeSlots.find(s => s.value === formData.timeSlot)?.label}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Venue:</span>
                      <span className="font-medium">{selectedTurf?.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Players:</span>
                      <span className="font-medium">Up to {formData.maxPlayers}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="maxPlayers" className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4" />
                    Maximum Players
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="maxPlayers"
                      type="number"
                      min="2"
                      max="22"
                      placeholder="e.g., 10"
                      value={formData.maxPlayers || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        maxPlayers: parseInt(e.target.value) || 2
                      }))}
                      className="h-12 text-lg"
                    />
                    <div className="text-sm text-gray-500">
                      (Suggested: {selectedFormat?.players})
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Include yourself as one player. Others will join your game.
                  </p>
                </div>

                <div>
                  <Label htmlFor="cost" className="flex items-center gap-2 mb-2">
                    <IndianRupee className="w-4 h-4" />
                    Cost per person (₹)
                  </Label>
                  <Input
                    id="cost"
                    type="number"
                    min="0"
                    step="50"
                    placeholder="e.g., 200"
                    value={formData.costPerPerson || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      costPerPerson: parseInt(e.target.value) || 0
                    }))}
                    className="h-12 text-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Total venue cost will be split equally among players
                  </p>
                </div>

                {/* Turf Booking Status Toggle */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label htmlFor="turfBooked" className="flex items-center gap-2 font-semibold text-gray-900 cursor-pointer">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Turf Already Booked
                      </Label>
                      <p className="text-sm text-gray-600 mt-1">
                        {formData.turfBooked
                          ? 'Great! The turf is reserved for this game.'
                          : 'Players will need to book the turf separately.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      id="turfBooked"
                      role="switch"
                      aria-checked={formData.turfBooked}
                      onClick={() => setFormData(prev => ({ ...prev, turfBooked: !prev.turfBooked }))}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                        formData.turfBooked ? 'bg-emerald-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          formData.turfBooked ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes" className="flex items-center gap-2 mb-2">
                    <MessageCircle className="w-4 h-4" />
                    Additional Notes (Optional)
                  </Label>
                  <Textarea
                    id="notes"
                    rows={4}
                    placeholder="e.g., Bring water bottles, meeting point details, special requirements..."
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    className="resize-none"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 4: Success with GameSuccessPage */}
            {(() => {
              console.log('📍 Step 4 render check:', { 
                currentStep: step, 
                isStep4: step === 4,
                createdGame: !!createdGame, 
                selectedTurf: !!selectedTurf, 
                user: !!user,
                createdGameData: createdGame,
                selectedTurfData: selectedTurf,
                userData: user
              });
              return step === 4;
            })() && (
              <div className="relative -m-6">
                <GameSuccessPage 
                  game={{
                    id: createdGame?.id || 'temp-id',
                    format: selectedFormat?.label || createdGame?.format || '5v5 Football',
                    turfName: selectedTurf?.name || createdGame?.turfName || 'Sample Turf',
                    turfAddress: selectedTurf?.address || createdGame?.turfAddress || 'Sample Address',
                    date: createdGame?.date || formData.date || new Date().toISOString().split('T')[0],
                    timeSlot: timeSlots.find(s => s.value === formData.timeSlot)?.label || formData.timeSlot || '18:00 - 19:00',
                    maxPlayers: selectedFormat?.players || createdGame?.maxPlayers || 10,
                    costPerPerson: createdGame?.costPerPerson || formData.costPerPerson || 100,
                    hostName: user?.name || 'Host',
                    hostPhone: user?.phone || '',
                    notes: formData.notes
                  }}
                  onClose={onClose}
                />
              </div>
            )}
          </div>

          {/* Enhanced Navigation - Fixed at bottom */}
          {step < 4 && (
            <div className="border-t bg-gray-50 p-4 flex-shrink-0">
              <div className="flex justify-between items-center">
                <Button 
                  variant="outline" 
                  onClick={handleBack}
                  disabled={step === 1 || loading}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </Button>
                
                {step === 3 ? (
                  <Button 
                    onClick={handleCreateGame}
                    disabled={loading}
                    className="bg-primary-600 hover:bg-primary-700 flex items-center gap-2 min-w-[140px]"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Create Game
                      </>
                    )}
                  </Button>
                ) : (
                  <Button 
                    onClick={handleNext}
                    disabled={step === 2 && !isStepComplete(2)}
                    className="bg-primary-600 hover:bg-primary-700 flex items-center gap-2"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}