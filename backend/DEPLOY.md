# Backend Deployment Log

## Latest Deployment: 2025-08-23T14:38:00Z

### Changes in this deployment:
- Fixed game creation and visibility issues
- Added /games/joined API endpoint for user's joined games
- Enhanced UserProfile with calendar view
- Added Google Maps links to turf listings
- Fixed TypeScript build errors
- Updated production start command

### Database Schema Updates:
- Games table with JOIN support for turf and user information
- Enhanced game model with proper data transformation

### API Endpoints Added:
- GET /api/games/joined - Get user's joined games
- Enhanced /api/games with turf and host information

### Environment Requirements:
- NODE_ENV=production
- DATABASE_URL (PostgreSQL connection string)
- JWT_SECRET (secure secret key)
- CORS_ORIGIN=https://turfer.vercel.app

---
Deployment trigger: ace4f22