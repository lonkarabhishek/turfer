// Analytics utilities for Turfer user behavior tracking

export type AnalyticsEvent = 
  | 'home_search_submitted'
  | 'filter_applied' 
  | 'card_viewed'
  | 'whatsapp_cta_clicked'
  | 'create_game_started'
  | 'join_game_confirmed'
  | 'smart_search_used'
  | 'location_requested'
  | 'turf_details_viewed'
  | 'booking_attempted'
  | 'assistant_opened'
  | 'recommendation_requested';

export interface AnalyticsProperties {
  [key: string]: string | number | boolean | undefined;
}

export function track(event: AnalyticsEvent, properties: AnalyticsProperties = {}) {
  // In a real implementation, you'd send to your analytics service
  // For now, we'll just console log and potentially use gtag if available
  
  const eventData = {
    event,
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    ...properties
  };

  console.log('📊 Analytics:', eventData);

  // If Google Analytics is loaded
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, properties);
  }

  // Store in localStorage for debugging/testing
  if (typeof window !== 'undefined') {
    try {
      const existingEvents = JSON.parse(localStorage.getItem('turfer_analytics') || '[]');
      existingEvents.push(eventData);
      
      // Keep only last 50 events to avoid storage bloat
      if (existingEvents.length > 50) {
        existingEvents.splice(0, existingEvents.length - 50);
      }
      
      localStorage.setItem('turfer_analytics', JSON.stringify(existingEvents));
    } catch (e) {
      console.warn('Failed to store analytics event:', e);
    }
  }
}

// Convenience functions for common events
export const analytics = {
  searchSubmitted: (query: string, filters: Record<string, any> = {}) => 
    track('home_search_submitted', { query, ...filters }),

  filterApplied: (filterType: string, filterValue: string | number) => 
    track('filter_applied', { filter_type: filterType, filter_value: filterValue }),

  cardViewed: (type: 'turf' | 'game', id: string, name: string) => 
    track('card_viewed', { card_type: type, item_id: id, item_name: name }),

  whatsappClicked: (action: string, context: string) => 
    track('whatsapp_cta_clicked', { action, context }),

  gameCreated: (format: string, turfId?: string) => 
    track('create_game_started', { format, turf_id: turfId }),

  gameJoined: (gameId: string, spotsLeft: number) => 
    track('join_game_confirmed', { game_id: gameId, spots_left: spotsLeft }),

  smartSearchUsed: (query: string, resultsCount: number) => 
    track('smart_search_used', { query, results_count: resultsCount }),

  locationRequested: (context: 'search' | 'filter' | 'manual') => 
    track('location_requested', { context }),

  turfDetailsViewed: (turfId: string, turfName: string) => 
    track('turf_details_viewed', { turf_id: turfId, turf_name: turfName }),

  bookingAttempted: (turfId: string, slot: string, players: number) => 
    track('booking_attempted', { turf_id: turfId, slot, players }),

  assistantOpened: () => 
    track('assistant_opened'),

  recommendationRequested: (context: 'assistant' | 'button') => 
    track('recommendation_requested', { context })
};

declare global {
  interface Window {
    gtag: (command: string, targetId: string, config?: Record<string, any>) => void;
  }
}