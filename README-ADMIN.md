# TapTurf Admin Portal

**🚨 CONFIDENTIAL - INTERNAL USE ONLY 🚨**

## Admin Access Credentials

**Username:** `turfmaster`  
**Password:** `SportHub@2024!`

⚠️ **Keep these credentials secure and do not share publicly**

## Live Admin Panel

🌐 **URL:** https://lonkarabhishek.github.io/turfer/

## Features

### 🔐 Security
- Password-protected access
- Session-based authentication
- No database storage of credentials
- Automatic logout on browser close

### 🌍 Multi-Environment Support
- **Development**: Local SQLite database
- **Staging**: Staging SQLite database  
- **Production**: Railway PostgreSQL database

### 📊 Management Tools
- Real-time backend connection status
- Database statistics and overview
- Turfs management and viewing
- Games monitoring
- User statistics (production environment)

### 🔧 Quick Actions
- Direct links to live applications
- Database admin tools (local only)
- Environment switching
- Data refresh capabilities

## Usage Instructions

1. **Access the Admin Panel**
   - Navigate to the live URL
   - Enter admin credentials
   - Select environment (defaults to Production)

2. **Monitor Systems**
   - Check connection status
   - View real-time statistics
   - Switch between environments as needed

3. **Manage Data**
   - Click refresh to load latest data
   - Browse turfs, games, and system info
   - Monitor backend health status

## Security Notes

- Session expires when browser is closed
- Failed login attempts show error messages
- No sensitive data is logged or stored client-side
- Production database access is read-only through API

## Environment Configuration

| Environment | Database | API Endpoint |
|------------|----------|--------------|
| Development | SQLite (local) | http://localhost:3001/api |
| Staging | SQLite (local) | http://localhost:3001/api |
| Production | PostgreSQL (Railway) | https://turfer-backend-production.up.railway.app/api |

## Domain Information

- **Main App:** https://tapturf.in
- **Admin Panel:** https://lonkarabhishek.github.io/turfer/
- **Backend API:** https://turfer-backend-production.up.railway.app/api

---

**⚠️ This admin panel is for authorized personnel only. Do not link to this from the main application or share the URL publicly.**