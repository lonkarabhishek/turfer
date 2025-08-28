import { SupabaseModel } from './SupabaseModel';
import { Game as GameType, JoinRequest } from '../types';

export class GameModel extends SupabaseModel {
  protected tableName = 'games';

  async create(gameData: Omit<GameType, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameType> {
    const data = {
      id: this.generateId(),
      host_id: gameData.hostId,
      turf_id: gameData.turfId,
      date: gameData.date,
      start_time: gameData.startTime,
      end_time: gameData.endTime,
      sport: gameData.sport,
      format: gameData.format,
      skill_level: gameData.skillLevel,
      current_players: gameData.currentPlayers,
      max_players: gameData.maxPlayers,
      cost_per_person: gameData.costPerPerson,
      description: gameData.description,
      notes: gameData.notes,
      is_private: gameData.isPrivate,
      join_requests: gameData.joinRequests || [],
      confirmed_players: gameData.confirmedPlayers || [],
      status: gameData.status
    };

    const result = await super.create(data);
    return this.mapRowToGame(result);
  }

  async findById(id: string): Promise<GameType | null> {
    const row = await super.findById(id);
    return row ? this.mapRowToGame(row) : null;
  }

  async findByHostId(hostId: string): Promise<GameType[]> {
    const { data, error } = await this.db
      .from(this.tableName)
      .select('*')
      .eq('host_id', hostId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    return (data || []).map(this.mapRowToGame);
  }

  async findJoinedGames(userId: string): Promise<GameType[]> {
    // Query for games where user is host or confirmed player
    const { data, error } = await this.db
      .from(this.tableName)
      .select(`
        *,
        turfs (
          name,
          address
        )
      `)
      .or(`host_id.eq.${userId},confirmed_players.cs.["${userId}"]`)
      .in('status', ['open', 'in_progress'])
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => {
      const game = this.mapRowToGame(row);
      // Add turf info if available
      if (row.turfs) {
        (game as any).turf_name = row.turfs.name;
        (game as any).turf_address = row.turfs.address;
      }
      return game;
    });
  }

  async findAvailableGames(filters: {
    sport?: string;
    skillLevel?: string;
    date?: string;
    location?: { lat: number; lng: number; radius: number };
    limit?: number;
  } = {}): Promise<GameType[]> {
    let query = this.db
      .from(this.tableName)
      .select(`
        *,
        turfs (
          name,
          address,
          lat,
          lng
        )
      `)
      .eq('status', 'open')
      .eq('is_private', false)
; // We'll filter this client-side for now

    if (filters.sport) {
      query = query.eq('sport', filters.sport);
    }

    if (filters.skillLevel && filters.skillLevel !== 'all') {
      query = query.or(`skill_level.eq.${filters.skillLevel},skill_level.eq.all`);
    }

    if (filters.date) {
      query = query.gte('date', filters.date);
    }

    // Note: Location filtering would require a more complex query
    // For now, we'll filter client-side if needed

    query = query.order('date', { ascending: true }).order('start_time', { ascending: true });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(row => {
      const game = this.mapRowToGame(row);
      if (row.turfs) {
        (game as any).turf_name = row.turfs.name;
        (game as any).turf_address = row.turfs.address;
        (game as any).lat = row.turfs.lat;
        (game as any).lng = row.turfs.lng;
      }
      return game;
    });
  }

  async joinGame(gameId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const game = await this.findById(gameId);
    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    if (game.status !== 'open') {
      return { success: false, message: 'Game is not open for joining' };
    }

    if (game.currentPlayers >= game.maxPlayers) {
      return { success: false, message: 'Game is full' };
    }

    if (game.confirmedPlayers.includes(userId)) {
      return { success: false, message: 'Already joined this game' };
    }

    if (game.joinRequests.some(req => req.userId === userId)) {
      return { success: false, message: 'Join request already pending' };
    }

    // For non-private games, directly add to confirmed players
    if (!game.isPrivate) {
      const updatedConfirmedPlayers = [...game.confirmedPlayers, userId];
      const newStatus = updatedConfirmedPlayers.length >= game.maxPlayers ? 'full' : 'open';
      
      await this.update(gameId, {
        confirmed_players: updatedConfirmedPlayers,
        current_players: updatedConfirmedPlayers.length + 1, // +1 for host
        status: newStatus
      });
      
      return { success: true, message: 'Successfully joined the game' };
    } else {
      // For private games, add to join requests
      const updatedJoinRequests = [...game.joinRequests, {
        userId,
        requestedAt: new Date().toISOString(),
        status: 'pending' as const
      }];
      
      await this.update(gameId, {
        join_requests: updatedJoinRequests
      });
      
      return { success: true, message: 'Join request sent to game host' };
    }
  }

  async leaveGame(gameId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const game = await this.findById(gameId);
    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    const updatedConfirmedPlayers = game.confirmedPlayers.filter(id => id !== userId);
    const updatedJoinRequests = game.joinRequests.filter(req => req.userId !== userId);
    
    if (updatedConfirmedPlayers.length === game.confirmedPlayers.length && 
        updatedJoinRequests.length === game.joinRequests.length) {
      return { success: false, message: 'Not part of this game' };
    }

    const newStatus = updatedConfirmedPlayers.length < game.maxPlayers ? 'open' : game.status;

    await this.update(gameId, {
      confirmed_players: updatedConfirmedPlayers,
      join_requests: updatedJoinRequests,
      current_players: updatedConfirmedPlayers.length + 1, // +1 for host
      status: newStatus
    });

    return { success: true, message: 'Successfully left the game' };
  }

  async createJoinRequest(gameId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const game = await this.findById(gameId);
      if (!game) {
        return { success: false, message: 'Game not found' };
      }

      if (game.hostId === userId) {
        return { success: false, message: 'You cannot join your own game' };
      }

      if (game.confirmedPlayers.includes(userId)) {
        return { success: false, message: 'Already joined this game' };
      }

      if (game.joinRequests.find(req => req.userId === userId)) {
        return { success: false, message: 'Join request already pending' };
      }

      const joinRequests = game.joinRequests || [];
      joinRequests.push({
        userId,
        requestedAt: new Date().toISOString(),
        status: 'pending'
      });

      await this.update(gameId, { join_requests: joinRequests });

      return { success: true, message: 'Join request sent successfully' };
    } catch (error) {
      console.error('Error creating join request:', error);
      return { success: false, message: 'Failed to send join request' };
    }
  }

  async getJoinRequests(gameId: string): Promise<JoinRequest[]> {
    try {
      const game = await this.findById(gameId);
      if (!game) return [];
      
      return game.joinRequests || [];
    } catch (error) {
      console.error('Error getting join requests:', error);
      return [];
    }
  }

  async acceptRequest(gameId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const game = await this.findById(gameId);
      if (!game) {
        return { success: false, message: 'Game not found' };
      }

      const joinRequests = game.joinRequests || [];
      const requestIndex = joinRequests.findIndex(req => req.userId === userId);
      
      if (requestIndex === -1) {
        return { success: false, message: 'Join request not found' };
      }

      // Remove from requests and add to confirmed players
      joinRequests.splice(requestIndex, 1);
      const confirmedPlayers = [...game.confirmedPlayers, userId];

      await this.update(gameId, {
        join_requests: joinRequests,
        confirmed_players: confirmedPlayers,
        current_players: confirmedPlayers.length + 1 // +1 for host
      });

      return { success: true, message: 'Player request accepted' };
    } catch (error) {
      console.error('Error accepting request:', error);
      return { success: false, message: 'Failed to accept request' };
    }
  }

  async rejectRequest(gameId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const game = await this.findById(gameId);
      if (!game) {
        return { success: false, message: 'Game not found' };
      }

      const joinRequests = game.joinRequests || [];
      const requestIndex = joinRequests.findIndex(req => req.userId === userId);
      
      if (requestIndex === -1) {
        return { success: false, message: 'Join request not found' };
      }

      joinRequests.splice(requestIndex, 1);

      await this.update(gameId, { join_requests: joinRequests });

      return { success: true, message: 'Player request rejected' };
    } catch (error) {
      console.error('Error rejecting request:', error);
      return { success: false, message: 'Failed to reject request' };
    }
  }

  async respondToJoinRequest(gameId: string, hostId: string, userId: string, approve: boolean): Promise<{ success: boolean; message: string }> {
    const game = await this.findById(gameId);
    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    if (game.hostId !== hostId) {
      return { success: false, message: 'Only the host can approve join requests' };
    }

    if (!game.joinRequests.some(req => req.userId === userId)) {
      return { success: false, message: 'No pending join request from this user' };
    }

    const updatedJoinRequests = game.joinRequests.filter(req => req.userId !== userId);

    if (approve) {
      if (game.currentPlayers >= game.maxPlayers) {
        return { success: false, message: 'Game is full' };
      }

      const updatedConfirmedPlayers = [...game.confirmedPlayers, userId];
      const newStatus = updatedConfirmedPlayers.length >= game.maxPlayers ? 'full' : 'open';

      await this.update(gameId, {
        join_requests: updatedJoinRequests,
        confirmed_players: updatedConfirmedPlayers,
        current_players: updatedConfirmedPlayers.length + 1, // +1 for host
        status: newStatus
      });

      return { success: true, message: 'Player approved and added to the game' };
    } else {
      await this.update(gameId, {
        join_requests: updatedJoinRequests
      });

      return { success: true, message: 'Join request declined' };
    }
  }

  private mapRowToGame = (row: any): GameType => {
    return {
      id: row.id,
      hostId: row.host_id,
      turfId: row.turf_id,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      sport: row.sport,
      format: row.format,
      skillLevel: row.skill_level,
      currentPlayers: row.current_players,
      maxPlayers: row.max_players,
      costPerPerson: row.cost_per_person,
      description: row.description,
      notes: row.notes,
      isPrivate: row.is_private,
      joinRequests: row.join_requests || [],
      confirmedPlayers: row.confirmed_players || [],
      status: row.status,
      createdAt: this.parseDateTime(row.created_at),
      updatedAt: this.parseDateTime(row.updated_at)
    };
  };
}