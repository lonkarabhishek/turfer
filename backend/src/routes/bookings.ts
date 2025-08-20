import { Router, Response } from 'express';
import { BookingModel } from '../models/Booking';
import { TurfModel } from '../models/Turf';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { validate, bookingCreateSchema } from '../middleware/validation';
import { ApiResponse } from '../types';

const router = Router();
const bookingModel = new BookingModel();
const turfModel = new TurfModel();

// Get user's bookings
router.get('/my-bookings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const bookings = await bookingModel.findByUserId(req.user!.id, { status, limit });

    res.json({
      success: true,
      data: bookings
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get my bookings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get booking by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const booking = await bookingModel.findById(req.params.id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      } as ApiResponse);
    }

    // Check if user owns this booking or owns the turf
    const turf = await turfModel.findById(booking.turfId);
    if (booking.userId !== req.user!.id && turf?.ownerId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: booking
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Create new booking
router.post('/', authenticateToken, validate(bookingCreateSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { turfId, date, startTime, endTime, totalPlayers, notes, paymentMethod } = req.body;

    // Check if turf exists
    const turf = await turfModel.findById(turfId);
    if (!turf || !turf.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Turf not found or inactive'
      } as ApiResponse);
    }

    // Check availability
    const isAvailable = await bookingModel.checkAvailability(turfId, date, startTime, endTime);
    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        error: 'Time slot not available'
      } as ApiResponse);
    }

    // Calculate duration and total amount
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const durationHours = (endMinutes - startMinutes) / 60;
    
    // Determine if it's weekend pricing (simplified - you might want to use a proper date library)
    const bookingDate = new Date(date);
    const isWeekend = bookingDate.getDay() === 0 || bookingDate.getDay() === 6;
    const hourlyRate = isWeekend && turf.pricePerHourWeekend 
      ? turf.pricePerHourWeekend 
      : turf.pricePerHour;
    
    const totalAmount = durationHours * hourlyRate;

    const booking = await bookingModel.create({
      userId: req.user!.id,
      turfId,
      date,
      startTime,
      endTime,
      totalPlayers,
      totalAmount,
      status: 'pending',
      notes,
      paymentStatus: 'pending',
      paymentMethod
    });

    res.status(201).json({
      success: true,
      data: booking,
      message: 'Booking created successfully'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Update booking status
router.patch('/:id/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      } as ApiResponse);
    }

    const booking = await bookingModel.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      } as ApiResponse);
    }

    // Check permissions
    const turf = await turfModel.findById(booking.turfId);
    const canUpdate = booking.userId === req.user!.id || 
                     turf?.ownerId === req.user!.id || 
                     req.user!.role === 'admin';

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    const updatedBooking = await bookingModel.update(req.params.id, { status });

    res.json({
      success: true,
      data: updatedBooking,
      message: 'Booking status updated successfully'
    } as ApiResponse);
  } catch (error: any) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get available slots for a turf on a specific date
router.get('/turf/:turfId/available-slots', async (req: AuthRequest, res: Response) => {
  try {
    const { turfId } = req.params;
    const date = req.query.date as string;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required'
      } as ApiResponse);
    }

    const turf = await turfModel.findById(turfId);
    if (!turf) {
      return res.status(404).json({
        success: false,
        error: 'Turf not found'
      } as ApiResponse);
    }

    const availableSlots = await bookingModel.getAvailableSlots(turfId, date);

    res.json({
      success: true,
      data: availableSlots
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Get turf bookings (for turf owners)
router.get('/turf/:turfId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { turfId } = req.params;
    const date = req.query.date as string;
    const status = req.query.status as string;

    // Check if user owns this turf
    const turf = await turfModel.findById(turfId);
    if (!turf) {
      return res.status(404).json({
        success: false,
        error: 'Turf not found'
      } as ApiResponse);
    }

    if (turf.ownerId !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      } as ApiResponse);
    }

    const bookings = await bookingModel.findByTurfId(turfId, { date, status });

    res.json({
      success: true,
      data: bookings
    } as ApiResponse);
  } catch (error: any) {
    console.error('Get turf bookings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as ApiResponse);
  }
});

// Helper function to convert time string to minutes
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export default router;