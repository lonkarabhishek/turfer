# Debug Email Confirmation

## Current Issue
The confirmation email is redirecting to `/confirm` but without the necessary tokens.

**Console output shows:**
```
🔗 Current URL: https://www.tapturf.in/confirm
🔑 URL params: {} (empty object)
❌ No valid tokens found after timeout
```

## Expected URL Format
The confirmation link should look like:
```
https://www.tapturf.in/confirm#access_token=xxx&expires_in=3600&refresh_token=xxx&token_type=bearer&type=signup
```

## Quick Fixes to Try

### 1. Supabase Dashboard Settings
- **Site URL**: `https://www.tapturf.in`
- **Redirect URLs**: Add `https://www.tapturf.in/**`

### 2. Use Default Email Template First
In Supabase Dashboard > Authentication > Email Templates:
- Temporarily switch back to the **default** confirm signup template
- Test if it works with the default template
- Then customize once working

### 3. Alternative: Use Magic Link Flow
Instead of email confirmation, use Supabase's magic link:
```javascript
const { error } = await supabase.auth.signInWithOtp({
  email: formData.email,
  options: {
    emailRedirectTo: `${window.location.origin}/confirm`
  }
})
```

### 4. Check Email Content
Look at the actual email received:
- Does the "Verify Email" button have a long URL with tokens?
- Or does it just go to `https://www.tapturf.in/confirm`?

## Next Steps
1. Check Supabase URL configuration
2. Try with default email template
3. Check what the actual email link looks like
4. Test with magic link if email confirmation fails