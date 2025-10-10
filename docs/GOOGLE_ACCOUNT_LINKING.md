# Google Account Linking (Telegram → Google)

Manual guide for linking Google account to Telegram user in MongoDB (dev/testing only).

## Prerequisites

- MongoDB access
- Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- Telegram ID
- Google account to link

## Quick Steps

### 1. Get Telegram ID
```javascript
db.users.find({ name: "Your Name" })
// Returns: { "_id": ObjectId("..."), "telegramId": 123456789 }
```

### 2. Authenticate via Web
1. Navigate to `/` and sign in with Google
2. This creates entries in `users` and `accounts` collections

### 3. Find Google Account
```javascript
// Find Google-authenticated user
db.users.findOne({ email: "your-email@gmail.com" })
// Note the _id: "67890abcdef..."

// Find Google account
db.accounts.findOne({
  userId: "67890abcdef...",
  provider: "google"
})
// Returns: { access_token, refresh_token, scope, ... }
```

### 4. Link to Telegram User
```javascript
// Get Telegram user's _id
const telegramUser = db.users.findOne({ telegramId: 123456789 });
const telegramUserId = telegramUser._id.toString();

// Update Google account to point to Telegram user
db.accounts.updateOne(
  { userId: "67890abcdef...", provider: "google" },
  { $set: { userId: telegramUserId } }
);

// Update Telegram user with email
db.users.updateOne(
  { telegramId: 123456789 },
  { $set: { email: "your-email@gmail.com", updatedAt: new Date() } }
);
```

### 5. Verify
```javascript
const user = db.users.findOne({ telegramId: 123456789 });
const account = db.accounts.findOne({
  userId: user._id.toString(),
  provider: "google"
});

// Verify:
// - user.email matches Google email
// - account.userId matches user._id.toString()
// - account.access_token and refresh_token exist
```

### 6. Test
Open Telegram Mini App at `/telegram-app` and ask: "What's on my calendar today?"

System will fetch tokens, auto-refresh if expired, and call Google Calendar API.

## Alternative: Programmatic Linking

```typescript
import { linkTelegramUserToGoogle } from "@/lib/telegram/bot";

await linkTelegramUserToGoogle(telegramId, {
  providerAccountId: "1234567890",
  access_token: "ya29...",
  refresh_token: "1//...",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "Bearer",
  scope: "openid email profile https://www.googleapis.com/auth/calendar",
  id_token: "eyJ...",
  email: "your-email@gmail.com",
});
```

## Troubleshooting

**"No user found with telegramId"**: Auth via Telegram mini app first to create user

**"No Google account found"**: Sign in with Google at `/` first

**"Token refresh failed"**:
1. Visit https://myaccount.google.com/permissions
2. Revoke app access
3. Re-authenticate via Google OAuth

**Calendar not working**: Check scope includes `https://www.googleapis.com/auth/calendar`

## Security

⚠️ Dev/testing only. `accounts` collection contains sensitive tokens. Never commit tokens or use manual linking in production.
