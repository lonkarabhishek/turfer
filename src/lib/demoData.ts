// Demo data for testing game requests and notifications
export function createDemoNotifications(userId: string) {
  const demoNotifications = [
    {
      id: `demo-notif-1`,
      user_id: userId,
      type: 'game_request',
      title: 'New Join Request! 🎾',
      message: 'Alex wants to join your Tennis Singles game at Elite Sports Arena',
      metadata: { gameId: 'demo-game-1', requestId: 'demo-req-1' },
      is_read: false,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 minutes ago
    },
    {
      id: `demo-notif-2`,
      user_id: userId,
      type: 'game_request_accepted',
      title: 'Request Accepted! 🎉',
      message: 'You\'ve been accepted to join the Football match at Victory Ground',
      metadata: { gameId: 'demo-game-2', requestId: 'demo-req-2' },
      is_read: false,
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString() // 15 minutes ago
    },
    {
      id: `demo-notif-3`,
      user_id: userId,
      type: 'game_full',
      title: 'Game Full 🎯',
      message: 'Your Cricket game at Sports Hub is now full and ready to start!',
      metadata: { gameId: 'demo-game-3' },
      is_read: true,
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2 hours ago
    }
  ];

  // Store in localStorage
  const existingNotifications = JSON.parse(localStorage.getItem('tapturf_notifications') || '[]');
  const combinedNotifications = [...demoNotifications, ...existingNotifications];
  localStorage.setItem('tapturf_notifications', JSON.stringify(combinedNotifications));
  
  return demoNotifications;
}

export function createDemoGameRequests(gameId: string) {
  const demoRequests = [
    {
      id: `demo-req-${gameId}-1`,
      game_id: gameId,
      user_id: 'demo-user-1',
      user_name: 'Alex Johnson',
      user_email: 'alex@example.com',
      user_phone: '+91 98765 43210',
      note: 'Looking forward to a great game! I play regularly.',
      status: 'pending',
      requested_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
    },
    {
      id: `demo-req-${gameId}-2`,
      game_id: gameId,
      user_id: 'demo-user-2', 
      user_name: 'Priya Sharma',
      user_email: 'priya@example.com',
      user_phone: '+91 87654 32109',
      note: 'Can I join? I\'m available for the full duration.',
      status: 'pending',
      requested_at: new Date(Date.now() - 25 * 60 * 1000).toISOString()
    }
  ];

  // Store in localStorage
  const existingRequests = JSON.parse(localStorage.getItem('tapturf_game_requests') || '[]');
  const combinedRequests = [...demoRequests, ...existingRequests];
  localStorage.setItem('tapturf_game_requests', JSON.stringify(combinedRequests));
  
  return demoRequests;
}