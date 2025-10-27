/**
 * Utility functions for game-related operations
 */

export interface GameData {
  id: string;
  date: string;
  timeSlot?: string;
  start_time?: string;
  [key: string]: any;
}

/**
 * Checks if a game is expired (past date or time)
 * @param game - Game object with date and time information
 * @returns true if the game is expired, false otherwise
 */
export const isGameExpired = (game: GameData): boolean => {
  try {
    console.log('🔍 Checking expiry for game:', game.id, {
      date: game.date,
      timeSlot: game.timeSlot,
      start_time: game.start_time,
      gameData: game
    });

    // Handle different date formats
    let gameDate: Date;
    if (typeof game.date === 'string' && game.date.includes(',')) {
      // Handle "Saturday, Sep 27" format - assume current year
      const currentYear = new Date().getFullYear();
      const dateStr = `${game.date}, ${currentYear}`;
      gameDate = new Date(dateStr);
      console.log('📅 Parsed date with current year:', dateStr, '→', gameDate);
    } else {
      gameDate = new Date(game.date);
    }

    // Fallback if date parsing failed
    if (isNaN(gameDate.getTime())) {
      console.log('⚠️ Invalid date, treating as non-expired:', game.date);
      return false; // Don't hide games with invalid dates
    }

    const today = new Date();

    // Set time to start of day for comparison
    today.setHours(0, 0, 0, 0);
    gameDate.setHours(0, 0, 0, 0);

    console.log('📅 Date comparison:', {
      rawDate: game.date,
      gameDate: gameDate.toISOString(),
      today: today.toISOString(),
      isToday: gameDate.getTime() === today.getTime(),
      isPastDate: gameDate < today
    });

    // If game is today, check the time slot
    if (gameDate.getTime() === today.getTime()) {
      let gameTime: string | undefined;

      // Try different time field names
      if (game.timeSlot) {
        gameTime = game.timeSlot.split('-')[0]; // Get start time from timeSlot (e.g., "18:00-19:00")
      } else if (game.start_time) {
        gameTime = game.start_time; // Use start_time directly
      }

      console.log('⏰ Time check for today game:', {
        gameTime,
        timeSlot: game.timeSlot,
        start_time: game.start_time
      });

      if (gameTime) {
        const [hours, minutes] = gameTime.split(':').map(Number);
        if (!isNaN(hours) && !isNaN(minutes)) {
          const gameDateTime = new Date();
          gameDateTime.setHours(hours, minutes, 0, 0);

          // Add 30 minute buffer - don't hide games that started less than 30 minutes ago
          const bufferTime = new Date();
          bufferTime.setMinutes(bufferTime.getMinutes() - 30);

          const isExpired = gameDateTime < bufferTime;

          console.log('⌛ Time-based expiry check:', {
            gameDateTime: gameDateTime.toISOString(),
            bufferTime: bufferTime.toISOString(),
            currentTime: new Date().toISOString(),
            isExpired
          });

          return isExpired;
        } else {
          console.log('⚠️ Invalid time format:', { hours, minutes, gameTime });
        }
      } else {
        console.log('⚠️ No time information found for today game');
      }
    }

    // Game is expired if date is in the past
    const isPastDate = gameDate < today;
    console.log('📊 Final expiry result:', isPastDate);
    return isPastDate;
  } catch (error) {
    console.error('❌ Error checking if game is expired:', error);
    return false; // Don't hide games if we can't determine expiry
  }
};

/**
 * Filters an array of games to exclude expired ones
 * @param games - Array of games to filter
 * @returns Array of non-expired games
 */
export const filterNonExpiredGames = <T extends GameData>(games: T[]): T[] => {
  console.log('🔄 Filtering games for expiry. Total games:', games.length);

  const nonExpiredGames = games.filter(game => {
    const isExpired = isGameExpired(game);
    console.log(`🎮 Game ${game.id}: ${isExpired ? '❌ EXPIRED' : '✅ ACTIVE'}`);
    return !isExpired;
  });

  console.log('📋 Filter result:', {
    totalGames: games.length,
    nonExpiredGames: nonExpiredGames.length,
    filteredOut: games.length - nonExpiredGames.length
  });

  return nonExpiredGames;
};

/**
 * Sorts games by date and time (upcoming first)
 * @param games - Array of games to sort
 * @returns Sorted array of games
 */
export const sortGamesByDateTime = <T extends GameData>(games: T[]): T[] => {
  return [...games].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);

    // First compare dates
    if (dateA.getTime() !== dateB.getTime()) {
      return dateA.getTime() - dateB.getTime();
    }

    // If same date, compare times
    const getTimeValue = (game: T) => {
      let timeStr = game.timeSlot?.split('-')[0] || game.start_time || '00:00';
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    return getTimeValue(a) - getTimeValue(b);
  });
};

/**
 * Gets the status of a game (upcoming, live, expired)
 * @param game - Game object
 * @returns Game status string
 */
export const getGameStatus = (game: GameData): 'upcoming' | 'live' | 'expired' => {
  const gameDate = new Date(game.date);
  const today = new Date();

  today.setHours(0, 0, 0, 0);
  gameDate.setHours(0, 0, 0, 0);

  if (gameDate < today) {
    return 'expired';
  }

  if (gameDate.getTime() === today.getTime()) {
    let gameTime = game.timeSlot?.split('-')[0] || game.start_time;
    if (gameTime) {
      const [startHours, startMinutes] = gameTime.split(':').map(Number);
      const endTime = game.timeSlot?.split('-')[1] || `${startHours + 1}:${startMinutes.toString().padStart(2, '0')}`;
      const [endHours, endMinutes] = endTime.split(':').map(Number);

      const now = new Date();
      const startDateTime = new Date();
      startDateTime.setHours(startHours, startMinutes, 0, 0);
      const endDateTime = new Date();
      endDateTime.setHours(endHours, endMinutes, 0, 0);

      if (now >= startDateTime && now <= endDateTime) {
        return 'live';
      } else if (now > endDateTime) {
        return 'expired';
      }
    }
  }

  return 'upcoming';
};