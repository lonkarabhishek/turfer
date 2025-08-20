import { Router, Response } from 'express';
import { TurfModel } from '../models/Turf';
import { AuthRequest, authenticateToken, requireRole, optionalAuth } from '../middleware/auth';
import { validate, turfCreateSchema } from '../middleware/validation';
import { ApiResponse, SearchQuery } from '../types';

const router = Router();
const turfModel = new TurfModel();

// Get all turfs with search and filtering
router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    console.log('Turfs GET request received with query:', req.query);
    
    const query: SearchQuery = {
      query: req.query.query as string,
      sport: req.query.sport as string,
      priceMin: req.query.priceMin ? Number(req.query.priceMin) : undefined,
      priceMax: req.query.priceMax ? Number(req.query.priceMax) : undefined,
      rating: req.query.rating ? Number(req.query.rating) : undefined,
      amenities: req.query.amenities ? (req.query.amenities as string).split(',') : undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 10,
      sort: req.query.sort as string || 'rating',
      order: (req.query.order as 'asc' | 'desc') || 'desc'
    };

    console.log('Processed search query:', query);
    const result = await turfModel.search(query);
    console.log('Search result:', result);

    res.json({
      success: true,
      data: {
        turfs: result.turfs,
        total: result.total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(result.total / (query.limit || 10))
      }
    } as ApiResponse);
  } catch (error: any) {
    console.error('Search turfs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get nearby turfs
router.get('/nearby', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius) || 10;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      } as ApiResponse);
    }

    const turfs = await turfModel.findNearby(lat, lng, radius);

    res.json({
      success: true,
      data: turfs
    } as ApiResponse);
  } catch (error: any) {
    console.error('Find nearby turfs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get turf by ID
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const turf = await turfModel.findById(req.params.id);
    
    if (!turf) {
      return res.status(404).json({
        success: false,
        error: 'Turf not found'
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: turf
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get turf error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Create new turf (owner only)
router.post('/', authenticateToken, requireRole(['owner', 'admin']), validate(turfCreateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const turfData = {
      ...req.body,
      ownerId: req.user!.id,
      rating: 0,
      totalReviews: 0,
      isActive: true
    };

    const turf = await turfModel.create(turfData);

    res.status(201).json({
      success: true,
      data: turf,
      message: 'Turf created successfully'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Create turf error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Update turf (owner only)
router.put('/:id', authenticateToken, requireRole(['owner', 'admin']), async (req: AuthRequest, res: Response) => {
  try {
    const turf = await turfModel.findById(req.params.id);
    
    if (!turf) {
      return res.status(404).json({
        success: false,
        error: 'Turf not found'
      } as ApiResponse);
    }

    // Check if user owns this turf (unless admin)
    if (req.user!.role !== 'admin' && turf.ownerId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only update your own turfs'
      } as ApiResponse);
    }

    const updatedTurf = await turfModel.update(req.params.id, req.body);

    res.json({
      success: true,
      data: updatedTurf,
      message: 'Turf updated successfully'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Update turf error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Delete turf (owner only)
router.delete('/:id', authenticateToken, requireRole(['owner', 'admin']), async (req: AuthRequest, res: Response) => {
  try {
    const turf = await turfModel.findById(req.params.id);
    
    if (!turf) {
      return res.status(404).json({
        success: false,
        error: 'Turf not found'
      } as ApiResponse);
    }

    // Check if user owns this turf (unless admin)
    if (req.user!.role !== 'admin' && turf.ownerId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own turfs'
      } as ApiResponse);
    }

    await turfModel.delete(req.params.id);

    res.json({
      success: true,
      message: 'Turf deleted successfully'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Delete turf error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get turfs owned by current user
router.get('/owner/my-turfs', authenticateToken, requireRole(['owner', 'admin']), async (req: AuthRequest, res: Response) => {
  try {
    const turfs = await turfModel.findByOwnerId(req.user!.id);

    res.json({
      success: true,
      data: turfs
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get my turfs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

export default router;