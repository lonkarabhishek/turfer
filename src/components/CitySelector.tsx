import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MapPin, Locate } from 'lucide-react';
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
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);

  const handleCitySelect = (cityId: string, cityName: string) => {
    onCityChange(cityName);
    setIsOpen(false);
  };

  const handleDetectLocation = async () => {
    setIsDetectingLocation(true);
    try {
      if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported by this browser');
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      // Use reverse geocoding to get city name
      const { latitude, longitude } = position.coords;
      
      // For now, let's detect if user is in one of our supported cities
      // In a real app, you'd use a reverse geocoding API
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
      );
      
      if (response.ok) {
        const data = await response.json();
        const detectedCity = data.city || data.locality || data.principalSubdivision;
        
        // Check if detected city matches our available cities
        const matchedCity = AVAILABLE_CITIES.find(city => 
          city.name.toLowerCase().includes(detectedCity.toLowerCase()) ||
          detectedCity.toLowerCase().includes(city.name.toLowerCase())
        );
        
        if (matchedCity) {
          handleCitySelect(matchedCity.id, matchedCity.name);
        } else {
          // If not in our supported cities, show the detected city anyway
          onCityChange(detectedCity);
          setIsOpen(false);
        }
      } else {
        throw new Error('Could not determine your location');
      }
    } catch (error) {
      console.error('Location detection failed:', error);
      alert('Could not detect your location. Please select your city manually.');
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const currentCityInfo = AVAILABLE_CITIES.find(city => 
    city.name.toLowerCase() === currentCity.toLowerCase()
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-full hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 text-sm font-medium"
      >
        <MapPin className="w-4 h-4 flex-shrink-0" />
        <span className="truncate max-w-[100px] md:max-w-none">{currentCityInfo?.name || currentCity}</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>

{isOpen && createPortal(
        <Modal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="🏙️ Choose Your City"
          size="md"
        >
          <div className="space-y-8">
            {/* Auto Location Detection */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-teal-400/20 rounded-2xl blur-xl"></div>
              <div className="relative bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/50 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
                    <Locate className="w-4 h-4 text-white" />
                  </div>
                  Quick Location
                </h3>
                <p className="text-emerald-700 text-sm mb-4">Let us find your city automatically</p>
                <Button
                  onClick={handleDetectLocation}
                  disabled={isDetectingLocation}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200"
                >
                  <Locate className={`w-5 h-5 mr-2 ${isDetectingLocation ? 'animate-spin' : 'animate-pulse'}`} />
                  {isDetectingLocation ? 'Locating you...' : 'Detect My Location'}
                </Button>
              </div>
            </div>

            {/* Available Cities */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
                <h4 className="text-base font-semibold text-gray-900 bg-white px-4 flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  Live Cities
                </h4>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
              </div>
              <div className="grid gap-3">
                {AVAILABLE_CITIES.map((city, index) => (
                  <button
                    key={city.id}
                    onClick={() => handleCitySelect(city.id, city.name)}
                    style={{ animationDelay: `${index * 100}ms` }}
                    className={`group relative w-full text-left p-4 rounded-2xl transition-all duration-300 animate-fade-in-up ${
                      currentCityInfo?.id === city.id
                        ? 'bg-gradient-to-r from-emerald-50 via-emerald-100 to-teal-50 border-2 border-emerald-300 shadow-lg shadow-emerald-500/25 scale-[1.02]'
                        : 'bg-white hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50 border-2 border-gray-200 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-500/10 hover:scale-[1.02]'
                    }`}
                  >
                    {currentCityInfo?.id === city.id && (
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-teal-400/20 rounded-2xl blur-sm -z-10"></div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className={`relative p-3 rounded-xl ${
                        currentCityInfo?.id === city.id 
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-lg' 
                          : 'bg-gradient-to-r from-gray-400 to-gray-500 group-hover:from-blue-500 group-hover:to-purple-500'
                      } transition-all duration-300`}>
                        <MapPin className="w-5 h-5 text-white" />
                        {currentCityInfo?.id === city.id && (
                          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-xl blur animate-pulse opacity-50"></div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className={`font-semibold text-lg ${
                          currentCityInfo?.id === city.id ? 'text-emerald-900' : 'text-gray-900 group-hover:text-blue-900'
                        } transition-colors duration-300`}>
                          {city.name}
                        </div>
                        <div className={`text-sm ${
                          currentCityInfo?.id === city.id ? 'text-emerald-600' : 'text-gray-500 group-hover:text-blue-600'
                        } transition-colors duration-300`}>
                          {city.state}
                        </div>
                      </div>
                      {currentCityInfo?.id === city.id && (
                        <div className="flex items-center gap-1 bg-emerald-200 text-emerald-800 px-3 py-1 rounded-full text-xs font-medium">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                          Selected
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Coming Soon Cities */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
                <h4 className="text-base font-semibold text-gray-700 bg-white px-4 flex items-center gap-2">
                  <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                  Coming Soon
                </h4>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-orange-300 to-transparent"></div>
              </div>
              <div className="grid gap-3">
                {COMING_SOON_CITIES.map((city, index) => (
                  <div
                    key={index}
                    style={{ animationDelay: `${(index + AVAILABLE_CITIES.length) * 100}ms` }}
                    className="group relative w-full text-left p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-orange-50 border-2 border-dashed border-orange-200 opacity-75 cursor-not-allowed animate-fade-in-up"
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative p-3 rounded-xl bg-gradient-to-r from-orange-400 to-amber-400 opacity-60">
                        <MapPin className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-lg text-gray-600">{city.name}</div>
                        <div className="text-sm text-gray-500">{city.state}</div>
                      </div>
                      <div className="flex items-center gap-1 bg-orange-200 text-orange-700 px-3 py-1 rounded-full text-xs font-medium">
                        <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                        Soon
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Info */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400/10 to-purple-400/10 rounded-2xl blur-sm"></div>
              <div className="relative bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200/50 rounded-2xl p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-lg">?</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-blue-900 mb-2">Don't see your city?</h4>
                    <p className="text-sm text-blue-800 leading-relaxed">
                      We're expanding rapidly across India! Follow us on social media to get notified when TapTurf launches in your area. 🚀
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Modal>,
        document.body
      )}
    </>
  );
}