import { useEffect, useRef, useState } from 'react';

interface IOSTimePickerProps {
  value: string; // Format: "HH:mm"
  onChange: (value: string) => void;
  label: string;
  minTime?: string; // Format: "HH:mm" - disable times before this
  maxTime?: string; // Format: "HH:mm" - disable times after this
}

export function IOSTimePicker({ value, onChange, label, minTime, maxTime }: IOSTimePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState(12);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');

  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const periodRef = useRef<HTMLDivElement>(null);

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = [0, 30];
  const periods: ('AM' | 'PM')[] = ['AM', 'PM'];

  const isTimeDisabled = (hour: number, minute: number, period: 'AM' | 'PM') => {
    const hour24 = period === 'AM'
      ? (hour === 12 ? 0 : hour)
      : (hour === 12 ? 12 : hour + 12);

    const timeInMinutes = hour24 * 60 + minute;

    if (minTime) {
      const [minHour, minMinute] = minTime.split(':').map(Number);
      const minTimeInMinutes = minHour * 60 + minMinute;
      if (timeInMinutes < minTimeInMinutes) return true;
    }

    if (maxTime) {
      const [maxHour, maxMinute] = maxTime.split(':').map(Number);
      const maxTimeInMinutes = maxHour * 60 + maxMinute;
      if (timeInMinutes > maxTimeInMinutes) return true;
    }

    return false;
  };

  useEffect(() => {
    if (value) {
      const [hourStr, minuteStr] = value.split(':');
      const hour24 = parseInt(hourStr);
      const minute = parseInt(minuteStr);

      const period = hour24 >= 12 ? 'PM' : 'AM';
      const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;

      setSelectedHour(hour12);
      setSelectedMinute(minute);
      setSelectedPeriod(period);
    }
  }, [value]);

  const handleConfirm = () => {
    const hour24 = selectedPeriod === 'AM'
      ? (selectedHour === 12 ? 0 : selectedHour)
      : (selectedHour === 12 ? 12 : selectedHour + 12);

    const timeString = `${hour24.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
    onChange(timeString);
    setShowPicker(false);
  };

  const formatDisplayTime = () => {
    if (!value) return 'Select time';
    const [hourStr, minuteStr] = value.split(':');
    const hour24 = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    return `${hour12}:${minuteStr} ${period}`;
  };

  const scrollToItem = (ref: React.RefObject<HTMLDivElement>, index: number) => {
    if (ref.current) {
      const itemHeight = 44;
      ref.current.scrollTop = index * itemHeight;
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="w-full border border-gray-300 rounded-lg h-12 px-3 text-left bg-white text-base focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
      >
        {formatDisplayTime()}
      </button>

      {showPicker && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={() => setShowPicker(false)}
          />

          {/* Picker Modal */}
          <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <button
                onClick={() => setShowPicker(false)}
                className="text-primary-600 font-medium text-base"
              >
                Cancel
              </button>
              <span className="font-semibold text-gray-900">{label}</span>
              <button
                onClick={handleConfirm}
                className="text-primary-600 font-semibold text-base"
              >
                Done
              </button>
            </div>

            {/* Picker */}
            <div className="relative h-64 overflow-hidden">
              {/* Selection highlight */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-11 bg-gray-100 rounded-lg pointer-events-none z-10" />

              <div className="flex h-full items-center justify-center">
                {/* Hours */}
                <div className="w-20 relative">
                  <div
                    ref={hourRef}
                    className="h-full overflow-y-scroll snap-y snap-mandatory hide-scrollbar"
                    onScroll={(e) => {
                      const scrollTop = e.currentTarget.scrollTop;
                      const index = Math.round(scrollTop / 44);
                      setSelectedHour(hours[index]);
                    }}
                  >
                    <div className="h-24" />
                    {hours.map((hour, index) => {
                      const disabled = isTimeDisabled(hour, selectedMinute, selectedPeriod);
                      return (
                        <div
                          key={hour}
                          className={`h-11 flex items-center justify-center text-xl font-medium snap-center transition-all ${
                            disabled
                              ? 'text-gray-300 cursor-not-allowed'
                              : selectedHour === hour
                              ? 'text-gray-900 scale-110 cursor-pointer'
                              : 'text-gray-400 cursor-pointer'
                          }`}
                          onClick={() => {
                            if (!disabled) {
                              setSelectedHour(hour);
                              scrollToItem(hourRef, index);
                            }
                          }}
                        >
                          {hour}
                        </div>
                      );
                    })}
                    <div className="h-24" />
                  </div>
                </div>

                {/* Separator */}
                <div className="flex items-center justify-center text-2xl font-bold text-gray-900 w-4 relative z-20">
                  :
                </div>

                {/* Minutes */}
                <div className="w-20 relative">
                  <div
                    ref={minuteRef}
                    className="h-full overflow-y-scroll snap-y snap-mandatory hide-scrollbar"
                    onScroll={(e) => {
                      const scrollTop = e.currentTarget.scrollTop;
                      const index = Math.round(scrollTop / 44);
                      setSelectedMinute(minutes[index]);
                    }}
                  >
                    <div className="h-24" />
                    {minutes.map((minute, index) => {
                      const disabled = isTimeDisabled(selectedHour, minute, selectedPeriod);
                      return (
                        <div
                          key={minute}
                          className={`h-11 flex items-center justify-center text-xl font-medium snap-center transition-all ${
                            disabled
                              ? 'text-gray-300 cursor-not-allowed'
                              : selectedMinute === minute
                              ? 'text-gray-900 scale-110 cursor-pointer'
                              : 'text-gray-400 cursor-pointer'
                          }`}
                          onClick={() => {
                            if (!disabled) {
                              setSelectedMinute(minute);
                              scrollToItem(minuteRef, index);
                            }
                          }}
                        >
                          {minute.toString().padStart(2, '0')}
                        </div>
                      );
                    })}
                    <div className="h-24" />
                  </div>
                </div>

                {/* Period (AM/PM) */}
                <div className="w-20 relative ml-2">
                  <div
                    ref={periodRef}
                    className="h-full overflow-y-scroll snap-y snap-mandatory hide-scrollbar"
                    onScroll={(e) => {
                      const scrollTop = e.currentTarget.scrollTop;
                      const index = Math.round(scrollTop / 44);
                      setSelectedPeriod(periods[index]);
                    }}
                  >
                    <div className="h-24" />
                    {periods.map((period, index) => (
                      <div
                        key={period}
                        className={`h-11 flex items-center justify-center text-xl font-medium snap-center cursor-pointer transition-all ${
                          selectedPeriod === period ? 'text-gray-900 scale-110' : 'text-gray-400'
                        }`}
                        onClick={() => {
                          setSelectedPeriod(period);
                          scrollToItem(periodRef, index);
                        }}
                      >
                        {period}
                      </div>
                    ))}
                    <div className="h-24" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
