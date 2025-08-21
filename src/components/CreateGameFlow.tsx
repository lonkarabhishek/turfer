import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, Clock, DollarSign, MessageCircle, X, Check, Search, MapPin, Loader2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { buildWhatsAppLink, generateGameInviteMessage } from '../lib/whatsapp';
import { track } from '../lib/analytics';
import { gamesAPI, turfsAPI } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import type { GameData } from './GameCard';
import type { TurfData } from './TurfCard';

interface CreateGameFlowProps {
  open: boolean;
  onClose: () => void;
  onGameCreated?: (game: GameData) => void;
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
}

const gameFormats = [
  { id: '7v7', label: '7v7 Football', players: 14, icon: '⚽' },
  { id: '5v5', label: '5v5 Football', players: 10, icon: '⚽' },
  { id: 'cricket', label: 'Cricket', players: 16, icon: '🏏' },
  { id: 'box-cricket', label: 'Box Cricket', players: 12, icon: '🏏' },
  { id: 'tennis', label: 'Tennis', players: 4, icon: '🎾' },
  { id: 'basketball', label: 'Basketball', players: 10, icon: '🏀' }
];

const skillLevels = [
  { id: 'all', label: 'All levels', description: 'Everyone welcome' },
  { id: 'beginner', label: 'Beginner', description: 'New to the sport' },
  { id: 'intermediate', label: 'Intermediate', description: 'Some experience' },
  { id: 'advanced', label: 'Advanced', description: 'High skill level' }
];

const formatToSport = {
  '7v7 Football': 'football',
  '5v5 Football': 'football', 
  'Cricket': 'cricket',
  'Box Cricket': 'cricket',
  'Tennis': 'tennis',
  'Basketball': 'basketball'
};

const timeSlots = [
  '05:00-06:00 AM', '06:00-07:00 AM', '07:00-08:00 AM', '08:00-09:00 AM', '09:00-10:00 AM',
  '10:00-11:00 AM', '11:00-12:00 PM', '12:00-01:00 PM', '01:00-02:00 PM', '02:00-03:00 PM',
  '03:00-04:00 PM', '04:00-05:00 PM', '05:00-06:00 PM', '06:00-07:00 PM', '07:00-08:00 PM', 
  '08:00-09:00 PM', '09:00-10:00 PM'
];

export function CreateGameFlow({ open, onClose, onGameCreated }: CreateGameFlowProps) {
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [availableTurfs, setAvailableTurfs] = useState<TurfData[]>([]);
  const [selectedTurf, setSelectedTurf] = useState<TurfData | null>(null);
  const [showTurfSearch, setShowTurfSearch] = useState(false);
  const [formData, setFormData] = useState({
    format: '',
    date: '',
    timeSlot: '',
    skillLevel: 'all' as 'beginner' | 'intermediate' | 'advanced' | 'all',
    maxPlayers: 0,
    costPerPerson: 0,
    notes: ''
  });
  const [createdGame, setCreatedGame] = useState<any>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setSearchTerm('');
      setSelectedTurf(null);
      setShowTurfSearch(false);
      setCreatedGame(null);
      setFormData({
        format: '',
        date: '',
        timeSlot: '',
        skillLevel: 'all',
        maxPlayers: 0,
        costPerPerson: 0,
        notes: ''
      });
    }
  }, [open]);

  // Search for turfs when search term changes
  useEffect(() => {
    const searchTurfs = async () => {
      if (searchTerm.length < 2) {
        setAvailableTurfs([]);
        return;
      }

      try {
        const response = await turfsAPI.search({ 
          query: searchTerm, 
          limit: 10 
        });
        if (response.success && response.data) {
          const turfs = response.data.turfs || [];
          const transformedTurfs = turfs.map((turf: any) => ({
            ...turf,
            priceDisplay: `₹${turf.pricePerHour}/hr`,
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

  if (!open) return null;

  // Check if user is authenticated
  if (!isAuthenticated()) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
        <Card className="w-96 p-6 text-center">
          <CardContent>
            <h3 className="text-lg font-semibold mb-2">Login Required</h3>
            <p className="text-gray-600 mb-4">You need to be logged in to create a game.</p>
            <Button onClick={onClose}>Close</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleFormatSelect = (format: any) => {
    setFormData(prev => ({
      ...prev,
      format: format.label,
      maxPlayers: format.players
    }));
    // Track game creation
    setStep(2);
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleCreateGame = async () => {
    if (!selectedTurf || !user) {
      setError('Please select a venue and ensure you are logged in');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Parse time slot to get start and end times
      const [timeRange] = formData.timeSlot.split(' ');
      const [startTime, endTime] = timeRange.split('-');
      
      // Prepare game data for backend
      const gameData: CreateGameData = {
        turfId: selectedTurf.id,
        date: formData.date,
        startTime: startTime,
        endTime: endTime,
        sport: formatToSport[formData.format as keyof typeof formatToSport] || 'football',
        format: formData.format,
        skillLevel: formData.skillLevel,
        maxPlayers: formData.maxPlayers,
        costPerPerson: formData.costPerPerson,
        description: `${formData.format} game at ${selectedTurf.name}`,
        notes: formData.notes || undefined,
        isPrivate: false
      };

      // Create game via API
      const response = await gamesAPI.createGame(gameData);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to create game');
      }

      // Create GameData for local display/sharing
      const displayGameData: GameData = {
        id: response.data.id,
        hostName: user.name,
        hostPhone: user.phone || '9999999999', // Fallback if no phone
        turfName: selectedTurf.name,
        turfAddress: selectedTurf.address,
        date: formData.date,
        timeSlot: formData.timeSlot,
        format: formData.format,
        skillLevel: formData.skillLevel === 'all' ? 'All levels' : 
                   formData.skillLevel.charAt(0).toUpperCase() + formData.skillLevel.slice(1) as any,
        currentPlayers: 1, // Host counts as first player
        maxPlayers: formData.maxPlayers,
        costPerPerson: formData.costPerPerson,
        notes: formData.notes,
        distanceKm: 0
      };

      setCreatedGame(displayGameData);

      track('create_game_success', { 
        format: formData.format,
        skill_level: formData.skillLevel,
        max_players: formData.maxPlayers,
        turf_id: selectedTurf.id
      });

      onGameCreated?.(displayGameData);
      setStep(4);

    } catch (error: any) {
      console.error('Create game error:', error);
      setError(error.message || 'Failed to create game. Please try again.');
      track('create_game_failed', { 
        error: error.message,
        format: formData.format
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div 
        className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div 
          className="bg-white w-full sm:w-[600px] max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          {/* Header */}
          <div className="p-4 border-b bg-primary-50 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-primary-900">Create Game</h2>
              <p className="text-sm text-primary-700">Step {step} of 3</p>
            </div>
            <Button variant="ghost" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
            {/* Step 1: Choose Format */}
            {step === 1 && (
              <motion.div 
                className="p-6"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Choose your game format</h3>
                  <p className="text-gray-600">What sport do you want to organize?</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {gameFormats.map((format) => (
                    <button
                      key={format.id}
                      onClick={() => handleFormatSelect(format)}
                      className="p-4 border-2 border-gray-200 rounded-xl hover:border-primary-300 hover:bg-primary-50 transition-all text-left"
                    >
                      <div className="text-2xl mb-2">{format.icon}</div>
                      <div className="font-medium">{format.label}</div>
                      <div className="text-sm text-gray-500">{format.players} players max</div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Game Details */}
            {step === 2 && (
              <motion.div 
                className="p-6 space-y-6"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <div>
                  <h3 className="text-lg font-semibold mb-2">Game details</h3>
                  <p className="text-gray-600">When and where do you want to play?</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="time">Time Slot</Label>
                    <select
                      id="time"
                      value={formData.timeSlot}
                      onChange={(e) => setFormData(prev => ({ ...prev, timeSlot: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md h-10 px-3 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors bg-white"
                    >
                      <option value="">Select time</option>
                      {timeSlots.map(slot => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Select Venue *</Label>
                  {selectedTurf ? (
                    <div className="border border-primary-300 bg-primary-50 rounded-lg p-3 flex items-start justify-between">
                      <div>
                        <div className="font-medium">{selectedTurf.name}</div>
                        <div className="text-sm text-gray-600 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {selectedTurf.address}
                        </div>
                        <div className="text-sm text-primary-600 font-medium">
                          {selectedTurf.priceDisplay}
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedTurf(null);
                          setShowTurfSearch(true);
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full h-auto p-4 text-left justify-start"
                      onClick={() => setShowTurfSearch(true)}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      <div>
                        <div className="font-medium">Search for a venue</div>
                        <div className="text-xs text-gray-500">Find turfs, sports complexes, and more</div>
                      </div>
                    </Button>
                  )}
                  
                  {/* Venue Search Modal */}
                  {showTurfSearch && (
                    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                      <Card className="w-full max-w-md max-h-[80vh] overflow-hidden">
                        <CardContent className="p-0">
                          <div className="p-4 border-b">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold">Select Venue</h3>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setShowTurfSearch(false)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="relative mt-3">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                              <Input
                                placeholder="Search venues..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                                autoFocus
                              />
                            </div>
                          </div>
                          
                          <div className="max-h-96 overflow-y-auto">
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
                                  <div className="font-medium">{turf.name}</div>
                                  <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                                    <MapPin className="w-3 h-3" />
                                    {turf.address}
                                  </div>
                                  <div className="text-sm text-primary-600 font-medium mt-1">
                                    {turf.priceDisplay}
                                  </div>
                                </button>
                              ))
                            ) : searchTerm.length >= 2 ? (
                              <div className="p-4 text-center text-gray-500">
                                No venues found for "{searchTerm}"
                              </div>
                            ) : (
                              <div className="p-4 text-center text-gray-500">
                                Type to search venues...
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Skill Level</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {skillLevels.map((level) => (
                      <button
                        key={level.id}
                        onClick={() => setFormData(prev => ({ ...prev, skillLevel: level.id as 'all' | 'beginner' | 'intermediate' | 'advanced' }))}
                        className={`p-3 border rounded-lg text-left transition-colors ${
                          formData.skillLevel === level.id
                            ? 'border-primary-300 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium">{level.label}</div>
                        <div className="text-xs text-gray-500">{level.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div className="flex gap-4">
                  <Button variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                  <Button 
                    onClick={handleNext} 
                    className="flex-1 bg-primary-600 hover:bg-primary-700"
                    disabled={!formData.date || !formData.timeSlot || !selectedTurf}
                  >
                    Continue
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Players & Cost */}
            {step === 3 && (
              <motion.div 
                className="p-6 space-y-6"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
              >
                <div>
                  <h3 className="text-lg font-semibold mb-2">Players and cost</h3>
                  <p className="text-gray-600">Set up the game logistics</p>
                </div>

                <div>
                  <Label>Max Players</Label>
                  <div className="h-10 px-3 border border-gray-300 rounded-md bg-gray-50 flex items-center">
                    <span className="text-gray-600">{formData.maxPlayers} players (including you as host)</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">You need {formData.maxPlayers - 1} more players to join</p>
                </div>

                <div>
                  <Label htmlFor="cost">Cost per person (₹)</Label>
                  <Input
                    id="cost"
                    type="number"
                    min="0"
                    step="50"
                    placeholder="e.g., 100"
                    value={formData.costPerPerson || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      costPerPerson: parseInt(e.target.value) || 0
                    }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Total cost will be split equally</p>
                </div>

                <div>
                  <Label htmlFor="notes">Additional Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    rows={3}
                    placeholder="e.g., Bring your own water bottles, meeting point details..."
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div className="flex gap-4">
                  <Button variant="outline" onClick={handleBack} disabled={loading}>
                    Back
                  </Button>
                  <Button 
                    onClick={handleCreateGame}
                    className="flex-1 bg-primary-600 hover:bg-primary-700"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating Game...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Create Game
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Success & Invite */}
            {step === 4 && (
              <motion.div 
                className="p-6 text-center space-y-6"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                
                <div>
                  <h3 className="text-xl font-semibold mb-2">Game created successfully! 🎉</h3>
                  <p className="text-gray-600">Your {createdGame?.format || formData.format} game is ready to share</p>
                </div>

                <Card className="text-left">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{createdGame?.date || formData.date} • {createdGame?.timeSlot || formData.timeSlot}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span>{createdGame?.turfName || selectedTurf?.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span>{(createdGame?.maxPlayers || formData.maxPlayers) - 1} spots left (1/{createdGame?.maxPlayers || formData.maxPlayers} players)</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-gray-500" />
                      <span>₹{createdGame?.costPerPerson || formData.costPerPerson}/person</span>
                    </div>
                  </CardContent>
                </Card>

                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    Share your game invite via WhatsApp to find players
                  </p>
                  
                  <Button 
                    onClick={() => {
                      if (createdGame && user) {
                        const message = generateGameInviteMessage({
                          hostName: createdGame.hostName,
                          turfName: createdGame.turfName,
                          date: createdGame.date,
                          slot: createdGame.timeSlot,
                          format: createdGame.format,
                          currentPlayers: createdGame.currentPlayers,
                          maxPlayers: createdGame.maxPlayers,
                          costPerPerson: createdGame.costPerPerson,
                          skillLevel: createdGame.skillLevel
                        });
                        const whatsappUrl = buildWhatsAppLink({
                          phone: user.phone || '9999999999',
                          text: message
                        });
                        window.open(whatsappUrl, '_blank');
                      }
                    }}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Share on WhatsApp
                  </Button>
                </div>

                <Button variant="outline" onClick={onClose} className="w-full">
                  Done
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}