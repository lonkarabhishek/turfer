# TapTurf - Production-Ready Turf Booking Platform

TapTurf is a modern, full-featured web application that connects sports enthusiasts with turf facilities, enabling seamless booking experiences for players and comprehensive management tools for turf owners.

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

## 🏗️ Architecture

### Frontend Stack
- **React 19** with TypeScript for type-safe development
- **Tailwind CSS** for responsive, utility-first styling
- **Framer Motion** for smooth animations and transitions
- **Lucide React** for consistent, modern icons
- **Recharts** for data visualization and analytics

## 🔧 Development Setup

### Prerequisites
- Node.js 18+ and npm
- Backend API server (separate repository)

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
   VITE_API_BASE_URL=http://localhost:3001/api
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   VITE_RAZORPAY_KEY=your_razorpay_key
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

### Backend Setup
The frontend expects a backend API running at the configured `VITE_API_BASE_URL`. Key endpoints include:

- `POST /auth/login` - User authentication
- `POST /auth/register` - User registration
- `GET /turfs` - Search turfs
- `POST /bookings` - Create bookings
- `GET /games` - Fetch games
- `POST /games` - Create games

### Deployment Options

#### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

#### Netlify
1. Build the project: `npm run build:frontend`
2. Deploy the `dist` folder to Netlify
3. Configure environment variables in Netlify settings

## 🔐 Security Considerations

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
