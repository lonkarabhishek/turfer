import { useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { Modal } from './ui/modal';

const AVAILABLE_CITIES = [
  { id: 'nashik', name: 'Nashik', state: 'Maharashtra' },
  { id: 'pune', name: 'Pune', state: 'Maharashtra' },
  { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra' },
  { id: 'bangalore', name: 'Bangalore', state: 'Karnataka' },
  { id: 'hyderabad', name: 'Hyderabad', state: 'Telangana' },
];

const COMING_SOON_CITIES = [
  { name: 'Delhi', state: 'Delhi' },
  { name: 'Chennai', state: 'Tamil Nadu' },
  { name: 'Kolkata', state: 'West Bengal' },
  { name: 'Ahmedabad', state: 'Gujarat' },
  { name: 'Jaipur', state: 'Rajasthan' },
];

interface CitySelectorProps {
  currentCity: string;
  onCityChange: (city: string) => void;
}

export function CitySelector({ currentCity, onCityChange }: CitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleCitySelect = (cityId: string, cityName: string) => {
    onCityChange(cityName);
    setIsOpen(false);
  };

  const currentCityInfo = AVAILABLE_CITIES.find(city => 
    city.name.toLowerCase() === currentCity.toLowerCase()
  );

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 md:gap-2 max-w-xs text-sm px-3 py-2 h-9 md:h-10 border-gray-300"
      >
        <MapPin className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
        <span className="truncate max-w-[80px] md:max-w-none">{currentCityInfo?.name || currentCity}</span>
        <ChevronDown className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" />
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Select City"
        size="md"
      >
        <div className="space-y-6">
          {/* Available Cities */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Available Cities</h4>
            <div className="space-y-2">
              {AVAILABLE_CITIES.map((city) => (
                <button
                  key={city.id}
                  onClick={() => handleCitySelect(city.id, city.name)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    currentCityInfo?.id === city.id
                      ? 'bg-primary-50 border border-primary-200'
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{city.name}</div>
                      <div className="text-sm text-gray-500">{city.state}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Coming Soon Cities */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Coming Soon</h4>
            <div className="space-y-2">
              {COMING_SOON_CITIES.map((city, index) => (
                <div
                  key={index}
                  className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 opacity-60 cursor-not-allowed"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-600">{city.name}</div>
                      <div className="text-sm text-gray-400">{city.state}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Don't see your city?</strong> We're expanding rapidly! 
              Follow us on social media to get notified when TapTurf launches in your area.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}