# How to Access Admin Panel

## Method 1: Browser Console (Quickest)

1. Go to http://localhost:5173
2. Press F12 to open browser console
3. Paste this code and press Enter:

```javascript
// Navigate to admin page
const currentUrl = new URL(window.location.href);
currentUrl.hash = 'admin';
window.location.href = currentUrl.toString();
```

## Method 2: Modify App State (For Development)

While on localhost:5173, in browser console:

```javascript
// Force navigate to admin
window.dispatchEvent(new CustomEvent('admin-navigate'));
```

## Method 3: URL Parameter

Add this to App.tsx URL detection or just manually navigate by updating React state.

For now, use Method 1 above - it's the simplest!

## Production

Once deployed to tapturf.in, you can access at:
```
https://tapturf.in/#admin
```

(Will need to add hash routing support)
