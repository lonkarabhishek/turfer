# 🔒 TapTurf Security Configuration

**CRITICAL SECURITY SETTINGS - DO NOT MODIFY WITHOUT AUTHORIZATION**

---

## Admin Panel Access Control

### Authorized Admin Email
**ONLY** the following email has admin panel access:

```
abhishek.lonkar@viit.ac.in
```

### Access Points Protected

1. **Admin Panel Button (TopNav.tsx)**
   - Location: `src/components/TopNav.tsx:283`
   - Condition: `user.email === 'abhishek.lonkar@viit.ac.in'`
   - Visibility: Button only appears for authorized admin

2. **Admin Panel Page (AdminTurfUpload.tsx)**
   - Location: `src/components/AdminTurfUpload.tsx:321-340`
   - Constant: `AUTHORIZED_ADMIN_EMAIL = 'abhishek.lonkar@viit.ac.in'`
   - Access Check: Component blocks all unauthorized users
   - Shows "Access Denied" screen for non-admin users

### Implementation Details

```typescript
// TopNav.tsx - Button visibility
{user.email === 'abhishek.lonkar@viit.ac.in' && (
  <button onClick={() => onAdminClick?.()}>
    Admin Panel
  </button>
)}

// AdminTurfUpload.tsx - Page access control
const AUTHORIZED_ADMIN_EMAIL = 'abhishek.lonkar@viit.ac.in';

if (!user || user.email !== AUTHORIZED_ADMIN_EMAIL) {
  return <AccessDenied />;
}
```

### Security Layers

✅ **Layer 1: UI Protection**
- Admin button hidden from non-admin users
- No visual indicator that admin panel exists

✅ **Layer 2: Component Protection**
- Direct navigation blocked
- Access denied screen shown
- User redirected to home

---

## Database Credentials

### Supabase Production Database

**Connection Details:**
- Host: `aws-0-ap-southeast-1.pooler.supabase.com`
- Port: `6543`
- User: `postgres.hwfsbpzercuoshodmnuf`
- Database: `postgres`
- Password: `5rCkckqFBOy0Wkrp` ⚠️ **KEEP PRIVATE**

**Supabase Project:**
- URL: `https://hwfsbpzercuoshodmnuf.supabase.co`
- Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZnNicHplcmN1b3Nob2RtbnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNjMxODMsImV4cCI6MjA3MTYzOTE4M30.XCWCIZ2B3UxvaMbmLyCntkxTCnjfeobW7PTblpqfwbo`

**⚠️ IMPORTANT:**
- Never commit these credentials to public repositories
- These are already in `vercel.json` and `.env` files
- Keep backup copies securely

---

## Admin Panel Features

### What Admin Can Do:

1. **Single Turf Upload**
   - Add individual turfs with full details
   - Upload images, pricing, amenities
   - Set operating hours, contact info

2. **Bulk CSV Upload**
   - Import multiple turfs from CSV
   - Automatic data parsing
   - Error reporting for failed uploads

3. **Turf Management**
   - All uploaded turfs owned by admin user
   - Can delete test data via SQL scripts

---

## File Locations Reference

### Security-Critical Files:
```
src/components/TopNav.tsx           # Admin button visibility
src/components/AdminTurfUpload.tsx  # Admin page access control
src/App.tsx                         # Admin route configuration
```

### Admin Panel Files:
```
src/components/AdminTurfUpload.tsx  # Main admin component
database/cleanup-test-turfs.sql     # Delete test turfs
scripts/import-turfs-from-csv.py    # CSV import script
TURF_IMPORT_INSTRUCTIONS.md         # Upload instructions
```

### Documentation:
```
SECURITY_CONFIG.md                  # This file
ADMIN_ACCESS.md                     # How to access admin
TURF_IMPORT_INSTRUCTIONS.md         # Import guide
```

---

## Important Notes

### When Starting New Coding Session:

1. ✅ Remember admin email: `abhishek.lonkar@viit.ac.in`
2. ✅ Admin panel URL: Click profile → "Admin Panel"
3. ✅ Security is TWO-LAYER (UI + Component)
4. ✅ Check this file before modifying admin access

### If You Need to Add New Admin:

1. Update `TopNav.tsx:283` condition
2. Update `AdminTurfUpload.tsx:321` constant
3. Update this documentation
4. Test thoroughly before deploying

### If You Need to Change Admin Email:

⚠️ **DO NOT change without authorization!**

If authorized to change:
1. Search codebase for `abhishek.lonkar@viit.ac.in`
2. Replace in both files mentioned above
3. Update this documentation
4. Test on localhost first
5. Commit with clear message

---

## Deployment URLs

**Development:**
- Local: `http://localhost:5173`
- Admin Access: Login → Profile Avatar → Admin Panel

**Production:**
- URL: `https://tapturf.in`
- Admin Access: Same as development

---

## Emergency Contact

**Project Owner:** Abhishek Lonkar
**Admin Email:** abhishek.lonkar@viit.ac.in

---

**Last Updated:** 2025-10-31
**Last Modified By:** Claude Code Assistant
**Commit:** 0ff1308 - CRITICAL: Restrict admin panel to authorized email only
