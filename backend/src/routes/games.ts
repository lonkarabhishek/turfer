import { Router, Response } from 'express';
import { GameModel } from '../models/Game';
import { TurfModel } from '../models/Turf';
import { AuthRequest, authenticateToken, optionalAuth } from '../middleware/auth';
import { validate, gameCreateSchema } from '../middleware/validation';
import { ApiResponse } from '../types';

const router = Router();
const gameModel = new GameModel();
const turfModel = new TurfModel();

// Get available games
router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      sport: req.query.sport as string,
      skillLevel: req.query.skillLevel as string,
      date: req.query.date as string,
      limit: req.query.limit ? Number(req.query.limit) : 20
    };

    // Add location filtering if coordinates provided
    if (req.query.lat && req.query.lng) {
      (filters as any).location = {
        lat: Number(req.query.lat),
        lng: Number(req.query.lng),
        radius: Number(req.query.radius) || 10
      };
    }

    const games = await gameModel.findAvailableGames(filters);

    res.json({
      success: true,
      data: games
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get games error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get user's hosted games
router.get('/my-games', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const games = await gameModel.findByHostId(req.user!.id);

    res.json({
      success: true,
      data: games
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get my games error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get user's joined games
router.get('/joined', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const joinedGames = await gameModel.findJoinedGames(req.user!.id);

    res.json({
      success: true,
      data: joinedGames
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get joined games error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get games by user ID (for profile view)
router.get('/user/:userId', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const games = await gameModel.findByHostId(req.params.userId);

    res.json({
      success: true,
      data: games
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get user games error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get game by ID
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const game = await gameModel.findById(req.params.id);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      } as ApiResponse);
    }

    // Hide private games from non-participants
    if (game.isPrivate && req.user) {
      const isParticipant = game.hostId === req.user.id || 
                           game.confirmedPlayers.includes(req.user.id) ||
                           game.joinRequests.includes(req.user.id);
      
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          error: 'This is a private game'
        } as ApiResponse);
      }
    } else if (game.isPrivate) {
      return res.status(403).json({
        success: false,
        error: 'This is a private game'
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: game
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get game error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Create new game
router.post('/', authenticateToken, validate(gameCreateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { turfId, date, startTime, endTime, sport, format, skillLevel, maxPlayers, costPerPerson, description, notes, isPrivate } = req.body;

    // Check if turf exists
    const turf = await turfModel.findById(turfId);
    if (!turf || !turf.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Turf not found or inactive'
      } as ApiResponse);
    }

    const game = await gameModel.create({
      hostId: req.user!.id,
      turfId,
      date,
      startTime,
      endTime,
      sport,
      format,
      skillLevel,
      currentPlayers: 1, // Host counts as first player
      maxPlayers,
      costPerPerson,
      description,
      notes,
      isPrivate: isPrivate || false,
      joinRequests: [],
      confirmedPlayers: [],
      status: 'open'
    });

    res.status(201).json({
      success: true,
      data: game,
      message: 'Game created successfully'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Create game error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Join a game
router.post('/:id/join', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await gameModel.joinGame(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      } as ApiResponse);
    }

    res.json({
      success: true,
      message: result.message
    } as ApiResponse);
  } catch (error: any) {
    console.error('Join game error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Leave a game
router.post('/:id/leave', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await gameModel.leaveGame(req.params.id, req.user!.id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      } as ApiResponse);
    }

    res.json({
      success: true,
      message: result.message
    } as ApiResponse);
  } catch (error: any) {
    console.error('Leave game error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Respond to join request (host only)
router.post('/:id/join-requests/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { approve } = req.body;
    
    if (typeof approve !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'approve field must be boolean'
      } as ApiResponse);
    }

    const result = await gameModel.respondToJoinRequest(
      req.params.id,
      req.user!.id,
      req.params.userId,
      approve
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message
      } as ApiResponse);
    }

    res.json({
      success: true,
      message: result.message
    } as ApiResponse);
  } catch (error: any) {
    console.error('Respond to join request error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Update game (host only)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const game = await gameModel.findById(req.params.id);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      } as ApiResponse);
    }

    if (game.hostId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only the host can update this game'
      } as ApiResponse);
    }

    // Don't allow updating certain fields if game has started or is full
    if (game.status === 'in_progress' || game.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update game that has started or completed'
      } as ApiResponse);
    }

    const updatedGame = await gameModel.update(req.params.id, req.body);

    res.json({
      success: true,
      data: updatedGame,
      message: 'Game updated successfully'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Update game error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Cancel/Delete game (host only)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const game = await gameModel.findById(req.params.id);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      } as ApiResponse);
    }

    if (game.hostId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only the host can cancel this game'
      } as ApiResponse);
    }

    if (game.status === 'in_progress' || game.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel game that has started or completed'
      } as ApiResponse);
      } else {
      // Update status to cancelled instead of deleting
      await gameModel.update(req.params.id, { status: 'cancelled' });
    }

    res.json({
      success: true,
      message: 'Game cancelled successfully'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Cancel game error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

export default router;