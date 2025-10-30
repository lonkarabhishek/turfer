# 🏟️ TapTurf - Modern Turf Booking Platform

**Live at: [tapturf.in](https://tapturf.in)**

A complete turf booking and game management platform built for sports enthusiasts and turf owners.

## 🚀 Features

### For Players
- **🏠 User Dashboard**: Complete personal dashboard with booking history, upcoming games, favorites, and wallet management
- **🏟️ Smart Turf Discovery**: Advanced search and filtering with real-time availability
- **📅 In-App Booking**: Streamlined booking system with secure payment processing
- **🎮 Game Joining**: Join community games or create your own with intelligent matching
- **💰 Wallet Integration**: Digital wallet for seamless payments and transaction history
- **📊 Personal Analytics**: Track your gaming activity, stats, and preferences
- **🔔 Smart Notifications**: Real-time updates on bookings, games, and important alerts

### For Turf Owners
- **📊 Owner Dashboard**: Comprehensive management console with analytics and insights
- **🏟️ Turf Management**: Add, edit, and manage multiple turf properties with photos and amenities
- **📈 Revenue Analytics**: Detailed earnings reports, occupancy rates, and performance metrics
- **📋 Booking Management**: View, approve, and manage all bookings with customer information
- **🎯 Game Hosting**: Create and manage games, track participants and earnings
- **📨 Communication Hub**: Integrated messaging system for customer communication
- **⚙️ Business Settings**: Manage pricing, availability, and business information

### Technical Excellence
- **🔐 Robust Authentication**: Secure email/password auth with OAuth support and role-based access
- **📱 Responsive Design**: Perfect experience across desktop, tablet, and mobile devices
- **🚨 Error Handling**: Comprehensive error boundaries and user-friendly error messages
- **🌐 Modern UI/UX**: Beautiful, accessible interface built with React and Tailwind CSS
- **⚡ Performance**: Optimized loading, caching, and smooth animations
- **🔒 Security**: Input validation, XSS protection, and secure API communication

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS + Framer Motion
- **Backend**: Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel
- **Domain**: tapturf.in

## 🔧 Development Setup

### Prerequisites
- Node.js 18+ and npm
- Supabase account and project

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd turf-booking
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env.local
   ```
   
   Configure these environment variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   JWT_SECRET=your_jwt_secret
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run build:frontend` - Build frontend only

## 🚀 Deployment

### Production Build
```bash
npm run build:frontend
```

### API Routes
The app uses Vercel serverless functions located in `/api` directory:

- `POST /api/auth/login` - User authentication
- `POST /api/auth/register` - User registration  
- `GET /api/turfs` - Search turfs
- `POST /api/bookings` - Create bookings
- `GET /api/games` - Fetch games
- `POST /api/games` - Create games

### Deployment Options

#### Vercel
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

The app automatically deploys to [tapturf.in](https://tapturf.in) on push to main branch.

## 🔐 Security Considerations

### ⚠️ CRITICAL: Admin Panel Access
**Admin panel is RESTRICTED to authorized email only.**

📄 **See `SECURITY_CONFIG.md` for complete details**

- **Authorized Admin**: `abhishek.lonkar@viit.ac.in`
- **Protected Files**:
  - `src/components/TopNav.tsx:283`
  - `src/components/AdminTurfUpload.tsx:321`
- **Security Layers**: UI + Component access control

### Frontend Security
- **Input Validation**: All user inputs are validated and sanitized
- **XSS Protection**: Proper escaping and Content Security Policy
- **Authentication**: Secure token storage and management
- **HTTPS**: All production deployments should use HTTPS

### Data Protection
- **Personal Information**: Minimal data collection with user consent
- **Payment Security**: PCI-compliant payment processing
- **Privacy**: GDPR/CCPA compliant data handling

## 🎨 Design System

### Colors
- **Primary**: Blue (#3B82F6) for main actions
- **Success**: Green (#10B981) for confirmations
- **Warning**: Amber (#F59E0B) for alerts
- **Error**: Red (#EF4444) for errors
- **Neutral**: Gray scale for text and backgrounds

### Typography
- **Headings**: Font weights 600-700
- **Body**: Font weight 400
- **System Font**: -apple-system, BlinkMacSystemFont, Segoe UI

### Spacing
- **Base unit**: 0.25rem (4px)
- **Common spacing**: 0.5rem, 1rem, 1.5rem, 2rem, 3rem
- **Container max-width**: 1200px

## 🤝 Contributing

### Development Workflow
1. Create feature branch from `main`
2. Implement changes with tests
3. Run linting and type checks
4. Submit pull request with description
5. Await code review and approval

### Code Standards
- **TypeScript**: Strict mode enabled
- **ESLint**: Airbnb configuration
- **Prettier**: Consistent code formatting
- **Commit Messages**: Conventional commit format

## 📄 License

This project is licensed under the MIT License.

---

**Built with ❤️ for the sports community**
