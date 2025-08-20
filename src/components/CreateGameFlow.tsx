import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, Clock, DollarSign, MessageCircle, X, Check } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
// Removed unused Badge import
import { buildWhatsAppLink, generateGameInviteMessage } from '../lib/whatsapp';
import { track } from '../lib/analytics';
import type { GameData } from './GameCard';

interface CreateGameFlowProps {
  open: boolean;
  onClose: () => void;
  onGameCreated?: (game: GameData) => void;
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

const timeSlots = [
  '06:00-07:00 AM', '07:00-08:00 AM', '08:00-09:00 AM',
  '06:00-07:00 PM', '07:00-08:00 PM', '08:00-09:00 PM', '09:00-10:00 PM'
];

export function CreateGameFlow({ open, onClose, onGameCreated }: CreateGameFlowProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    format: '',
    date: '',
    timeSlot: '',
    venue: '',
    skillLevel: 'all',
    maxPlayers: 0,
    currentPlayers: 1, // Host counts as 1
    costPerPerson: 0,
    notes: '',
    hostName: 'You', // In real app, get from user profile
    hostPhone: '9876543210' // In real app, get from user profile
  });
  const [inviteGenerated, setInviteGenerated] = useState(false);

  if (!open) return null;

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

  const handleCreateGame = () => {
    const gameData: GameData = {
      id: `game_${Date.now()}`,
      hostName: formData.hostName,
      hostPhone: formData.hostPhone,
      turfName: formData.venue || 'TBD - Looking for suggestions',
      turfAddress: 'Location TBD',
      date: formData.date || 'Today',
      timeSlot: formData.timeSlot,
      format: formData.format,
      skillLevel: formData.skillLevel as any,
      currentPlayers: formData.currentPlayers,
      maxPlayers: formData.maxPlayers,
      costPerPerson: formData.costPerPerson,
      notes: formData.notes,
      distanceKm: 0
    };

    const message = generateGameInviteMessage({
      hostName: gameData.hostName,
      turfName: gameData.turfName,
      date: gameData.date,
      slot: gameData.timeSlot,
      format: gameData.format,
      currentPlayers: gameData.currentPlayers,
      maxPlayers: gameData.maxPlayers,
      costPerPerson: gameData.costPerPerson,
      skillLevel: gameData.skillLevel
    });
    const whatsappUrl = buildWhatsAppLink({
      phone: formData.hostPhone,
      text: message
    });

    track('create_game_started', { 
      format: formData.format,
      skill_level: formData.skillLevel,
      max_players: formData.maxPlayers
    });

    // In a real app, save to backend here
    onGameCreated?.(gameData);
    setInviteGenerated(true);
    setStep(4);

    // Auto-open WhatsApp after short delay
    setTimeout(() => {
      window.open(whatsappUrl, '_blank');
    }, 1000);
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
                  <Label htmlFor="venue">Preferred Venue (optional)</Label>
                  <Input
                    id="venue"
                    placeholder="e.g., Big Bounce Turf, Govind Nagar"
                    value={formData.venue}
                    onChange={(e) => setFormData(prev => ({ ...prev, venue: e.target.value }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave blank to ask for suggestions</p>
                </div>

                <div>
                  <Label>Skill Level</Label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {skillLevels.map((level) => (
                      <button
                        key={level.id}
                        onClick={() => setFormData(prev => ({ ...prev, skillLevel: level.id }))}
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

                <div className="flex gap-4">
                  <Button variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                  <Button 
                    onClick={handleNext} 
                    className="flex-1 bg-primary-600 hover:bg-primary-700"
                    disabled={!formData.date || !formData.timeSlot}
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="current-players">Current Players (including you)</Label>
                    <Input
                      id="current-players"
                      type="number"
                      min="1"
                      max={formData.maxPlayers}
                      value={formData.currentPlayers}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        currentPlayers: Math.max(1, parseInt(e.target.value) || 1)
                      }))}
                    />
                  </div>
                  
                  <div>
                    <Label>Max Players</Label>
                    <div className="h-10 px-3 border border-gray-300 rounded-md bg-gray-50 flex items-center">
                      <span className="text-gray-600">{formData.maxPlayers} players</span>
                    </div>
                  </div>
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

                <div className="flex gap-4">
                  <Button variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                  <Button 
                    onClick={handleCreateGame}
                    className="flex-1 bg-primary-600 hover:bg-primary-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Game
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
                  <p className="text-gray-600">Your {formData.format} game is ready to share</p>
                </div>

                <Card className="text-left">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{formData.date} • {formData.timeSlot}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span>{formData.maxPlayers - formData.currentPlayers} spots left ({formData.currentPlayers}/{formData.maxPlayers} players)</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-gray-500" />
                      <span>₹{formData.costPerPerson}/person</span>
                    </div>
                  </CardContent>
                </Card>

                <div>
                  <p className="text-sm text-gray-600 mb-4">
                    {inviteGenerated 
                      ? "We're opening WhatsApp to help you share your game!"
                      : "Share your game invite via WhatsApp to find players"
                    }
                  </p>
                  
                  <Button 
                    onClick={() => {
                      const message = generateGameInviteMessage({
                        ...formData,
                        turfName: formData.venue || 'TBD - Looking for suggestions',
                        turfAddress: 'Location TBD'
                      } as any);
                      const whatsappUrl = buildWhatsAppLink({
                        phone: formData.hostPhone,
                        text: message
                      });
                      window.open(whatsappUrl, '_blank');
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