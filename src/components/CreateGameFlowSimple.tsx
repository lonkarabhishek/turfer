import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { gamesAPI, turfsAPI } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface CreateGameFlowSimpleProps {
  open: boolean;
  onClose: () => void;
  onGameCreated?: (game: any) => void;
}

export function CreateGameFlowSimple({ open, onClose, onGameCreated }: CreateGameFlowSimpleProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [turfs, setTurfs] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    format: '5v5 Football',
    turfId: '',
    date: '',
    startTime: '18:00',
    endTime: '19:00',
    costPerPerson: 100
  });

  const loadTurfs = async () => {
    try {
      const response = await turfsAPI.search({ limit: 10 });
      if (response.success && response.data) {
        setTurfs(response.data.turfs || []);
        if (response.data.turfs?.length > 0) {
          setFormData(prev => ({ ...prev, turfId: response.data.turfs[0].id }));
        }
      }
    } catch (error) {
      console.error('Error loading turfs:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('Please login first');
      return;
    }
    
    if (!formData.turfId || !formData.date) {
      setError('Please fill all required fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const gameData = {
        turfId: formData.turfId,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        sport: 'football',
        format: formData.format,
        skillLevel: 'all' as const,
        maxPlayers: 10,
        costPerPerson: formData.costPerPerson,
        description: `${formData.format} game`,
        isPrivate: false
      };

      const response = await gamesAPI.createGame(gameData as any);
      
      if (response.success) {
        alert('🎉 Game created successfully!');
        onGameCreated?.(response.data);
        onClose();
      } else {
        throw new Error(response.error || 'Failed to create game');
      }
    } catch (error: any) {
      console.error('Create game error:', error);
      setError(error.message || 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Create Game (Simple)</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Format</Label>
            <select
              value={formData.format}
              onChange={(e) => setFormData(prev => ({ ...prev, format: e.target.value }))}
              className="w-full border rounded px-3 py-2"
            >
              <option>5v5 Football</option>
              <option>7v7 Football</option>
              <option>Cricket</option>
              <option>Basketball</option>
            </select>
          </div>

          <div>
            <Label>Venue</Label>
            <select
              value={formData.turfId}
              onChange={(e) => setFormData(prev => ({ ...prev, turfId: e.target.value }))}
              onFocus={turfs.length === 0 ? loadTurfs : undefined}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select venue...</option>
              {turfs.map((turf) => (
                <option key={turf.id} value={turf.id}>
                  {turf.name} - ₹{turf.pricePerHour}/hr
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              min={new Date().toISOString().split('T')[0]}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label>Cost per person (₹)</Label>
            <Input
              type="number"
              value={formData.costPerPerson}
              onChange={(e) => setFormData(prev => ({ ...prev, costPerPerson: Number(e.target.value) }))}
              min="0"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Creating...' : 'Create Game'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}