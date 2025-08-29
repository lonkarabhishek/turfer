// Enhanced smart search with natural language parsing and filter chips

export interface SearchQuery {
  text: string;
  filters: {
    date?: string;
    time?: string;
    area?: string;
    format?: string; // e.g., "7v7", "5v5", "cricket"
    budget?: number;
    players?: number;
  };
}

export interface FilterChip {
  id: string;
  label: string;
  value: string | number;
  type: 'date' | 'time' | 'area' | 'format' | 'budget' | 'players';
  removable: boolean;
}

// Natural language patterns
const patterns = {
  // Date patterns
  date: [
    { regex: /\b(today|tonight)\b/i, value: 'today' },
    { regex: /\b(tomorrow|tmrw)\b/i, value: 'tomorrow' },
    { regex: /\b(this weekend|weekend)\b/i, value: 'weekend' },
    { regex: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i, value: 'weekday' },
    { regex: /\b(\d{1,2})[/\-](\d{1,2})\b/, value: 'specific_date' }
  ],
  
  // Time patterns
  time: [
    { regex: /\b(\d{1,2})(:\d{2})?\s*(am|pm|AM|PM)\b/g, value: 'specific_time' },
    { regex: /\b(morning|early morning)\b/i, value: '6-9 AM' },
    { regex: /\b(afternoon|noon)\b/i, value: '12-4 PM' },
    { regex: /\b(evening|night|tonight)\b/i, value: '6-10 PM' },
    { regex: /\b(late night|midnight)\b/i, value: '10 PM-12 AM' },
    { regex: /\bafter (\d{1,2})\s*(pm|PM)?\b/i, value: 'after_time' }
  ],
  
  // Area patterns (Nashik-specific)
  area: [
    { regex: /\b(govind nagar|govindnagar)\b/i, value: 'Govind Nagar' },
    { regex: /\b(gangotri vihar|gangotri)\b/i, value: 'Gangotri Vihar' },
    { regex: /\b(dwarka|tigraniya)\b/i, value: 'Dwarka' },
    { regex: /\b(college road|college rd)\b/i, value: 'College Road' },
    { regex: /\b(cidco|cidco area)\b/i, value: 'CIDCO' },
    { regex: /\b(near me|nearby|close)\b/i, value: 'nearby' }
  ],
  
  // Format/Sport patterns
  format: [
    { regex: /\b(\d+)v(\d+)\b/i, value: 'vs_format' },
    { regex: /\b(\d+)\s*vs?\s*(\d+)\b/i, value: 'vs_format' },
    { regex: /\b(football|soccer|futsal)\b/i, value: 'Football' },
    { regex: /\b(cricket|batting|bowling)\b/i, value: 'Cricket' },
    { regex: /\b(box cricket)\b/i, value: 'Box Cricket' },
    { regex: /\b(tennis|badminton)\b/i, value: 'Tennis' },
    { regex: /\b(basketball|basket ball)\b/i, value: 'Basketball' }
  ],
  
  // Budget patterns
  budget: [
    { regex: /\bunder (\d+)\b/i, value: 'under_budget' },
    { regex: /\bbelow (\d+)\b/i, value: 'under_budget' },
    { regex: /\b(\d+)\s*rupees?\b/i, value: 'specific_budget' },
    { regex: /\b₹(\d+)\b/, value: 'specific_budget' },
    { regex: /\b(cheap|budget|affordable)\b/i, value: 'budget_friendly' },
    { regex: /\b(expensive|premium|luxury)\b/i, value: 'premium' }
  ],
  
  // Players patterns
  players: [
    { regex: /\bfor (\d+) players?\b/i, value: 'player_count' },
    { regex: /\b(\d+) people\b/i, value: 'player_count' },
    { regex: /\b(\d+) person team\b/i, value: 'player_count' }
  ]
};

export function parseSmartQuery(text: string): SearchQuery {
  const query: SearchQuery = {
    text: text.trim(),
    filters: {}
  };

  // Parse date
  for (const pattern of patterns.date) {
    const match = text.match(pattern.regex);
    if (match) {
      if (pattern.value === 'today') {
        query.filters.date = new Date().toISOString().split('T')[0];
      } else if (pattern.value === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        query.filters.date = tomorrow.toISOString().split('T')[0];
      } else if (pattern.value === 'weekend') {
        query.filters.date = 'weekend';
      } else if (pattern.value === 'specific_date' && match[1] && match[2]) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = new Date().getFullYear();
        query.filters.date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
      break;
    }
  }

  // Parse time
  const timeMatches = text.matchAll(/\b(\d{1,2})(:\d{2})?\s*(am|pm|AM|PM)\b/g);
  const times = Array.from(timeMatches);
  if (times.length > 0) {
    const timeMatch = times[0];
    query.filters.time = `${timeMatch[1]}${timeMatch[2] || ':00'} ${timeMatch[3].toUpperCase()}`;
  } else {
    for (const pattern of patterns.time) {
      if (typeof pattern.regex === 'object' && pattern.regex.test && pattern.regex.test(text)) {
        query.filters.time = pattern.value;
        break;
      }
    }
  }

  // Parse area
  for (const pattern of patterns.area) {
    const match = text.match(pattern.regex);
    if (match) {
      query.filters.area = pattern.value;
      break;
    }
  }

  // Parse format
  for (const pattern of patterns.format) {
    const match = text.match(pattern.regex);
    if (match) {
      if (pattern.value === 'vs_format') {
        query.filters.format = `${match[1]}v${match[2]}`;
      } else {
        query.filters.format = pattern.value;
      }
      break;
    }
  }

  // Parse budget
  for (const pattern of patterns.budget) {
    const match = text.match(pattern.regex);
    if (match) {
      if (pattern.value === 'under_budget' || pattern.value === 'specific_budget') {
        query.filters.budget = parseInt(match[1]);
      } else if (pattern.value === 'budget_friendly') {
        query.filters.budget = 800; // Under 800
      } else if (pattern.value === 'premium') {
        query.filters.budget = 1500; // Above 1500
      }
      break;
    }
  }

  // Parse players
  for (const pattern of patterns.players) {
    const match = text.match(pattern.regex);
    if (match) {
      query.filters.players = parseInt(match[1]);
      break;
    }
  }

  return query;
}

export function createFilterChips(query: SearchQuery): FilterChip[] {
  const chips: FilterChip[] = [];

  if (query.filters.date) {
    let label = query.filters.date;
    if (query.filters.date === 'weekend') label = 'This Weekend';
    else if (query.filters.date === new Date().toISOString().split('T')[0]) label = 'Today';
    else if (query.filters.date === new Date(Date.now() + 86400000).toISOString().split('T')[0]) label = 'Tomorrow';
    
    chips.push({
      id: 'date',
      label: label,
      value: query.filters.date,
      type: 'date',
      removable: true
    });
  }

  if (query.filters.time) {
    chips.push({
      id: 'time',
      label: query.filters.time,
      value: query.filters.time,
      type: 'time',
      removable: true
    });
  }

  if (query.filters.area) {
    chips.push({
      id: 'area',
      label: `Near ${query.filters.area}`,
      value: query.filters.area,
      type: 'area',
      removable: true
    });
  }

  if (query.filters.format) {
    chips.push({
      id: 'format',
      label: query.filters.format,
      value: query.filters.format,
      type: 'format',
      removable: true
    });
  }

  if (query.filters.budget) {
    const label = query.filters.budget <= 800 ? 'Budget Friendly' : 
                  query.filters.budget >= 1500 ? 'Premium' : 
                  `Under ₹${query.filters.budget}`;
    chips.push({
      id: 'budget',
      label: label,
      value: query.filters.budget,
      type: 'budget',
      removable: true
    });
  }

  if (query.filters.players) {
    chips.push({
      id: 'players',
      label: `${query.filters.players} players`,
      value: query.filters.players,
      type: 'players',
      removable: true
    });
  }

  return chips;
}

export function removeFilterChip(chips: FilterChip[], chipId: string): FilterChip[] {
  return chips.filter(chip => chip.id !== chipId);
}

export function buildSearchSuggestions(currentText: string): string[] {
  const suggestions = [
    "Tonight 7-9pm near Govind Nagar",
    "Tomorrow morning cricket",
    "Weekend 7v7 football under ₹800",
    "Today after 6pm for 10 players",
    "Budget friendly turfs near me",
    "Box cricket tomorrow evening",
    "5v5 football this weekend",
    "Morning slots under 600 rupees"
  ];

  if (!currentText.trim()) {
    return suggestions.slice(0, 4);
  }

  // Filter suggestions based on current input
  const filtered = suggestions.filter(s => 
    s.toLowerCase().includes(currentText.toLowerCase())
  );

  return filtered.length > 0 ? filtered : suggestions.slice(0, 4);
}