import { BaseModel } from './BaseModel';
import { Game as GameType } from '../types';

export class GameModel extends BaseModel {
  async create(gameData: Omit<GameType, 'id' | 'createdAt' | 'updatedAt'>): Promise<GameType> {
    const id = this.generateId();
    
    const sql = `
      INSERT INTO games (
        id, host_id, turf_id, date, start_time, end_time, 
        sport, format, skill_level, current_players, max_players, 
        cost_per_person, description, notes, is_private, 
        join_requests, confirmed_players, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.run(sql, [
      id,
      gameData.hostId,
      gameData.turfId,
      gameData.date,
      gameData.startTime,
      gameData.endTime,
      gameData.sport,
      gameData.format,
      gameData.skillLevel,
      gameData.currentPlayers,
      gameData.maxPlayers,
      gameData.costPerPerson,
      gameData.description || null,
      gameData.notes || null,
      gameData.isPrivate ? 1 : 0,
      this.stringifyJsonField(gameData.joinRequests),
      this.stringifyJsonField(gameData.confirmedPlayers),
      gameData.status
    ]);

    return this.findById(id) as Promise<GameType>;
  }

  async findById(id: string): Promise<GameType | null> {
    const sql = 'SELECT * FROM games WHERE id = ?';
    const row = await this.db.get(sql, [id]);
    
    return row ? this.mapRowToGame(row) : null;
  }

  async findByHostId(hostId: string): Promise<GameType[]> {
    const sql = 'SELECT * FROM games WHERE host_id = ? ORDER BY created_at DESC';
    const rows = await this.db.all(sql, [hostId]);
    
    return rows.map(this.mapRowToGame);
  }

  async findAvailableGames(filters: {
    sport?: string;
    skillLevel?: string;
    date?: string;
    location?: { lat: number; lng: number; radius: number };
    limit?: number;
  } = {}): Promise<GameType[]> {
    let sql = `
      SELECT g.*, t.lat, t.lng, t.name as turf_name, t.address as turf_address
      FROM games g
      JOIN turfs t ON g.turf_id = t.id
      WHERE g.status = 'open' 
      AND g.is_private = 0
      AND g.current_players < g.max_players
    `;
    
    const params: any[] = [];

    if (filters.sport) {
      sql += ' AND g.sport = ?';
      params.push(filters.sport);
    }

    if (filters.skillLevel && filters.skillLevel !== 'all') {
      sql += ' AND (g.skill_level = ? OR g.skill_level = "all")';
      params.push(filters.skillLevel);
    }

    if (filters.date) {
      sql += ' AND g.date >= ?';
      params.push(filters.date);
    }

    // Add location-based filtering if provided
    if (filters.location) {
      sql += ` AND (
        6371 * acos(
          cos(radians(?)) * 
          cos(radians(t.lat)) * 
          cos(radians(t.lng) - radians(?)) + 
          sin(radians(?)) * 
          sin(radians(t.lat))
        )
      ) <= ?`;
      params.push(
        filters.location.lat,
        filters.location.lng,
        filters.location.lat,
        filters.location.radius
      );
    }

    sql += ' ORDER BY g.date ASC, g.start_time ASC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = await this.db.all(sql, params);
    return rows.map(this.mapRowToGame);
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

    if (game.joinRequests.includes(userId)) {
      return { success: false, message: 'Join request already pending' };
    }

    // For non-private games, directly add to confirmed players
    if (!game.isPrivate) {
      const updatedConfirmedPlayers = [...game.confirmedPlayers, userId];
      const newStatus = updatedConfirmedPlayers.length >= game.maxPlayers ? 'full' : 'open';
      
      await this.update(gameId, {
        confirmedPlayers: updatedConfirmedPlayers,
        currentPlayers: updatedConfirmedPlayers.length + 1, // +1 for host
        status: newStatus
      });
      
      return { success: true, message: 'Successfully joined the game' };
    } else {
      // For private games, add to join requests
      const updatedJoinRequests = [...game.joinRequests, userId];
      
      await this.update(gameId, {
        joinRequests: updatedJoinRequests
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
    const updatedJoinRequests = game.joinRequests.filter(id => id !== userId);
    
    if (updatedConfirmedPlayers.length === game.confirmedPlayers.length && 
        updatedJoinRequests.length === game.joinRequests.length) {
      return { success: false, message: 'Not part of this game' };
    }

    const newStatus = updatedConfirmedPlayers.length < game.maxPlayers ? 'open' : game.status;

    await this.update(gameId, {
      confirmedPlayers: updatedConfirmedPlayers,
      joinRequests: updatedJoinRequests,
      currentPlayers: updatedConfirmedPlayers.length + 1, // +1 for host
      status: newStatus
    });

    return { success: true, message: 'Successfully left the game' };
  }

  async respondToJoinRequest(gameId: string, hostId: string, userId: string, approve: boolean): Promise<{ success: boolean; message: string }> {
    const game = await this.findById(gameId);
    if (!game) {
      return { success: false, message: 'Game not found' };
    }

    if (game.hostId !== hostId) {
      return { success: false, message: 'Only the host can approve join requests' };
    }

    if (!game.joinRequests.includes(userId)) {
      return { success: false, message: 'No pending join request from this user' };
    }

    const updatedJoinRequests = game.joinRequests.filter(id => id !== userId);

    if (approve) {
      if (game.currentPlayers >= game.maxPlayers) {
        return { success: false, message: 'Game is full' };
      }

      const updatedConfirmedPlayers = [...game.confirmedPlayers, userId];
      const newStatus = updatedConfirmedPlayers.length >= game.maxPlayers ? 'full' : 'open';

      await this.update(gameId, {
        joinRequests: updatedJoinRequests,
        confirmedPlayers: updatedConfirmedPlayers,
        currentPlayers: updatedConfirmedPlayers.length + 1, // +1 for host
        status: newStatus
      });

      return { success: true, message: 'Player approved and added to the game' };
    } else {
      await this.update(gameId, {
        joinRequests: updatedJoinRequests
      });

      return { success: true, message: 'Join request declined' };
    }
  }

  async update(id: string, updates: Partial<Omit<GameType, 'id' | 'createdAt' | 'updatedAt'>>): Promise<GameType | null> {
    const updateData: any = {};
    
    if (updates.date) updateData.date = updates.date;
    if (updates.startTime) updateData.start_time = updates.startTime;
    if (updates.endTime) updateData.end_time = updates.endTime;
    if (updates.sport) updateData.sport = updates.sport;
    if (updates.format) updateData.format = updates.format;
    if (updates.skillLevel) updateData.skill_level = updates.skillLevel;
    if (updates.currentPlayers !== undefined) updateData.current_players = updates.currentPlayers;
    if (updates.maxPlayers) updateData.max_players = updates.maxPlayers;
    if (updates.costPerPerson !== undefined) updateData.cost_per_person = updates.costPerPerson;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.isPrivate !== undefined) updateData.is_private = updates.isPrivate ? 1 : 0;
    if (updates.joinRequests) updateData.join_requests = this.stringifyJsonField(updates.joinRequests);
    if (updates.confirmedPlayers) updateData.confirmed_players = this.stringifyJsonField(updates.confirmedPlayers);
    if (updates.status) updateData.status = updates.status;

    const { set, params } = this.buildUpdateClause(updateData);
    
    if (!set) return this.findById(id);
    
    const sql = `UPDATE games SET ${set} WHERE id = ?`;
    await this.db.run(sql, [...params, id]);
    
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM games WHERE id = ?';
    const result = await this.db.run(sql, [id]);
    return result.changes > 0;
  }

  private mapRowToGame(row: any): GameType {
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
      isPrivate: Boolean(row.is_private),
      joinRequests: this.parseJsonField(row.join_requests) || [],
      confirmedPlayers: this.parseJsonField(row.confirmed_players) || [],
      status: row.status,
      createdAt: this.parseDateTime(row.created_at),
      updatedAt: this.parseDateTime(row.updated_at)
    };
  }
}