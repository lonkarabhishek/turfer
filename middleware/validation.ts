import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details.map(detail => detail.message)
      });
    }
    
    next();
  };
};

// Validation schemas
export const userRegistrationSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  role: Joi.string().valid('user', 'owner').default('user')
});

export const userLoginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

export const turfCreateSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  address: Joi.string().min(5).max(500).required(),
  coordinates: Joi.object({
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required()
  }).optional(),
  description: Joi.string().max(1000).optional(),
  sports: Joi.array().items(Joi.string()).min(1).required(),
  amenities: Joi.array().items(Joi.string()).required(),
  images: Joi.array().items(Joi.string().uri()).optional(),
  pricePerHour: Joi.number().positive().required(),
  pricePerHourWeekend: Joi.number().positive().optional(),
  operatingHours: Joi.object().required(),
  contactInfo: Joi.object({
    phone: Joi.string().optional(),
    email: Joi.string().email().optional(),
    website: Joi.string().uri().optional()
  }).required()
});

export const bookingCreateSchema = Joi.object({
  turfId: Joi.string().required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  endTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  totalPlayers: Joi.number().integer().min(1).max(50).required(),
  notes: Joi.string().max(500).optional(),
  paymentMethod: Joi.string().valid('cash', 'online', 'wallet').optional()
});

export const gameCreateSchema = Joi.object({
  turfId: Joi.string().required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  startTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  endTime: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  sport: Joi.string().required(),
  format: Joi.string().required(),
  skillLevel: Joi.string().valid('beginner', 'intermediate', 'advanced', 'all').required(),
  maxPlayers: Joi.number().integer().min(2).max(50).required(),
  costPerPerson: Joi.number().min(0).required(),
  description: Joi.string().max(500).optional(),
  notes: Joi.string().max(500).optional(),
  isPrivate: Joi.boolean().default(false)
});

export const reviewCreateSchema = Joi.object({
  turfId: Joi.string().required(),
  bookingId: Joi.string().optional(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(500).optional()
});