# Linking Your Google Account to Telegram User (Manual Method)

This guide shows you how to manually link your real Google account to a Telegram user in MongoDB for testing purposes.

## Prerequisites

1. MongoDB Atlas access (or local MongoDB connection string)
2. A Google account you want to link
3. Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
4. Your Telegram ID (from the Telegram app)

## Step-by-Step Guide

### Step 1: Get Your Telegram ID

First, find your Telegram ID by logging into the Telegram mini app:

1. Open your Telegram app
2. Navigate to your bot
3. Your Telegram ID will be logged or stored in the database

Or use this MongoDB query:
```javascript
db.users.find({ name: "Your Name" })
```

Example result:
```json
{
  "_id": ObjectId("..."),
  "telegramId": 123456789,
  "name": "Your Name"
}
```

### Step 2: Authenticate with Google (Web Interface)

1. **Open your browser** and navigate to your app's web interface
2. **Sign in with Google** using the web login at `/`
3. **Complete the OAuth flow** - this will create entries in both `users` and `accounts` collections

### Step 3: Find Your Google Account in MongoDB

Connect to MongoDB and run:

```javascript
// Find your Google-authenticated user
db.users.findOne({ email: "your-email@gmail.com" })
```

This returns:
```json
{
  "_id": ObjectId("67890abcdef..."),
  "email": "your-email@gmail.com",
  "name": "Your Name",
  "emailVerified": null
}
```

Now find the linked Google account:
```javascript
// Using the _id from above
db.accounts.findOne({
  userId: "67890abcdef...",  // The _id as a string
  provider: "google"
})
```

This returns:
```json
{
  "_id": ObjectId("..."),
  "userId": "67890abcdef...",
  "type": "oauth",
  "provider": "google",
  "providerAccountId": "1234567890",
  "access_token": "ya29.a0AfH6SMB...",
  "refresh_token": "1//0gHPj...",
  "expires_at": 1735890123,
  "token_type": "Bearer",
  "scope": "openid email profile https://www.googleapis.com/auth/calendar",
  "id_token": "eyJhbGc..."
}
```

### Step 4: Link Google Account to Your Telegram User

Now that you have:
- Your Telegram user in the database (with `telegramId`)
- Your Google account details

You need to link them together:

```javascript
// Step 4.1: Get your Telegram user's _id
const telegramUser = db.users.findOne({ telegramId: 123456789 });
const telegramUserId = telegramUser._id.toString();

// Step 4.2: Get the Google account details
const googleAccount = db.accounts.findOne({
  userId: "67890abcdef...",  // Your Google-authenticated user's _id
  provider: "google"
});

// Step 4.3: Update the Google account to point to your Telegram user
db.accounts.updateOne(
  { _id: googleAccount._id },
  {
    $set: {
      userId: telegramUserId  // Link to Telegram user instead
    }
  }
);

// Step 4.4: Update your Telegram user with the email
db.users.updateOne(
  { telegramId: 123456789 },
  {
    $set: {
      email: "your-email@gmail.com",
      updatedAt: new Date()
    }
  }
);
```

### Step 5: Verify the Linking

Check that the link was successful:

```javascript
// Find your Telegram user
const user = db.users.findOne({ telegramId: 123456789 });
console.log("User:", user);

// Find the linked Google account
const account = db.accounts.findOne({
  userId: user._id.toString(),
  provider: "google"
});
console.log("Google account:", account);
```

You should see:
- `user.email` matches your Google email
- `account.userId` matches your Telegram user's `_id.toString()`
- `account.access_token` and `account.refresh_token` are present

### Step 6: Test in the Telegram App

1. **Open the Telegram Mini App** at `/telegram-app`
2. **Send a message** asking about your calendar:
   ```
   What's on my calendar today?
   ```
3. **Verify** the bot can access your Google Calendar

The system will:
- Fetch your Google tokens from the database
- Auto-refresh if expired
- Use the tokens to access Google Calendar API

## Alternative: Use the Programmatic Linking Function

Instead of manual MongoDB queries, you can use the `linkTelegramUserToGoogle` function:

```typescript
import { linkTelegramUserToGoogle } from "@/lib/telegram/bot";

// Your Telegram ID
const telegramId = 123456789;

// Google account details from OAuth
const googleAccount = {
  providerAccountId: "1234567890",
  access_token: "ya29.a0AfH6SMB...",
  refresh_token: "1//0gHPj...",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "Bearer",
  scope: "openid email profile https://www.googleapis.com/auth/calendar",
  id_token: "eyJhbGc...",
  email: "your-email@gmail.com",
};

// Link them
await linkTelegramUserToGoogle(telegramId, googleAccount);
```

You can run this in a script or via the Next.js API route.

## Troubleshooting

### Error: "No user found with telegramId"

The Telegram user doesn't exist in the database. First authenticate via Telegram mini app to create the user.

### Error: "No Google account found"

You haven't signed in via Google OAuth yet. Go to `/` and sign in with Google first.

### Error: "Token refresh failed"

The refresh token might be invalid or revoked:
1. Go to https://myaccount.google.com/permissions
2. Revoke access to your app
3. Re-authenticate via Google OAuth
4. Repeat the linking process

### Calendar access not working

Check the token scopes:
```javascript
const account = db.accounts.findOne({
  userId: "your-user-id",
  provider: "google"
});

console.log("Scopes:", account.scope);
// Should include: https://www.googleapis.com/auth/calendar
```

If the scope is missing, re-authenticate with the correct scope.

## Security Notes

⚠️ **IMPORTANT**:
- The `accounts` collection contains sensitive access tokens
- Only perform these operations in development/testing
- Never share your tokens or commit them to version control
- In production, users should link via the OAuth flow, not manual DB updates

## Next Steps

After successfully linking:
1. Test calendar queries in the Telegram app
2. Verify token auto-refresh works (wait 1 hour and test again)
3. Test the automated Playwright flow (see `__tests__/e2e/telegram-google-linking.spec.ts`)
