# Google Token Management & Telegram Linking Plan

## Current State Analysis

### Database Schema (NextAuth MongoDBAdapter)

**accounts collection:**
```typescript
{
  _id: ObjectId,
  userId: string,           // References users._id
  type: "oauth",
  provider: "google",
  providerAccountId: string,
  access_token: string,     // Current access token
  refresh_token: string,    // Refresh token (never expires unless revoked)
  expires_at: number,       // Unix timestamp (seconds) when access_token expires
  token_type: "Bearer",
  scope: string,
  id_token: string
}
```

**users collection:**
```typescript
{
  _id: ObjectId,
  email: string,
  name: string,
  tier: "free" | "paid" | "admin",
  telegramId?: number,      // If linked to Telegram
  telegramChatId?: number,
  createdAt: Date,
  lastLogin: Date
}
```

### Current Issues

1. **Backend agents** (schedulers, webhooks) can't access Google tokens - only session-based flows work
2. **Dev test user** relies on `PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING` env var (manual refresh)
3. **Telegram users** have no way to link their Google account for calendar access
4. **Token refresh** logic exists but only in NextAuth JWT callback (session-only)

---

## Solution Architecture

### Phase 1: Backend Token Refresh Utility

#### File: `src/lib/google-tokens.ts`

```typescript
interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in seconds
}

/**
 * Get Google tokens for a user from DB accounts collection
 * Automatically refreshes if expired
 */
async function getUserGoogleTokens(userId: string): Promise<GoogleTokens | null>

/**
 * Force refresh Google access token and update DB
 */
async function refreshUserGoogleToken(userId: string): Promise<GoogleTokens | null>

/**
 * Check if access token is expired (with 5min buffer)
 */
function isTokenExpired(expiresAt: number): boolean
```

**Implementation:**
1. Query `accounts` collection for user's Google OAuth account
2. Check `expires_at` field (subtract 5min buffer)
3. If expired, use Google OAuth2 client to refresh
4. Update `accounts` collection with new tokens
5. Return fresh tokens

**Benefits:**
- Works in any context (sessions, schedulers, webhooks)
- Automatic refresh with caching
- Fallback to env var for dev if DB has no account

---

### Phase 2: Update Backend Tools

#### Changes to `src/lib/agent/tools.server.ts`

```typescript
export const getBackendTools = async (
  userId: string,
  googleAccessTokenOverride?: string | null
) => {
  // 1. Try override (from session)
  let googleAccessToken = googleAccessTokenOverride;

  // 2. If no override, fetch from DB with auto-refresh
  if (!googleAccessToken) {
    const tokens = await getUserGoogleTokens(userId);
    googleAccessToken = tokens?.accessToken;
  }

  // 3. Fallback to env var for dev
  if (!googleAccessToken) {
    googleAccessToken = process.env.PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING;
  }

  // Generate MCP token with fresh Google token
  const mcpToken = await generateMcpToken(userId, googleAccessToken);

  return [getWeatherTool, micromanagerMCP(mcpToken), ...];
};
```

#### Changes to MCP Dev Auth (`src/app/mcp/route.ts`)

```typescript
if (devApiKey && bearerToken === devApiKey) {
  const testUserId = process.env.MCP_DEV_TEST_USER_ID || "999000000";

  // Fetch from DB instead of env var
  const tokens = await getUserGoogleTokens(testUserId);

  return {
    token: bearerToken,
    scopes: ["read:user-context", "write:user-context"],
    clientId: testUserId,
    extra: {
      googleAccessToken: tokens?.accessToken, // Auto-refreshed from DB
    },
  };
}
```

---

### Phase 3: Telegram-to-Google Account Linking

#### User Flow

**For Telegram-authenticated users to link Google:**

1. **User triggers linking** (from Telegram Mini App settings)
   ```
   /telegram-app → "Connect Google Calendar" button
   ```

2. **Initiate OAuth flow** with state parameter containing Telegram user info
   ```typescript
   // New endpoint: GET /api/auth/google/link?telegramId=123456
   - Generate secure state token (JWT with telegramId + nonce)
   - Redirect to Google OAuth with state
   ```

3. **OAuth callback** verifies state and links accounts
   ```typescript
   // NextAuth callback handler enhanced
   - Verify state token
   - Extract telegramId
   - Link Google account to existing Telegram user
   - Update users collection: add email from Google
   ```

4. **Confirmation** shown in Telegram Mini App
   ```
   "✅ Google Calendar connected!"
   ```

#### Implementation Steps

**Step 1: Create linking initiation endpoint**

`src/app/api/auth/google/link/route.ts`:
```typescript
export async function GET(req: NextRequest) {
  // 1. Get telegramId from query or session
  // 2. Generate state JWT: { telegramId, nonce, exp }
  // 3. Build Google OAuth URL with state
  // 4. Return redirect
}
```

**Step 2: Enhance NextAuth callback**

`src/auth.ts`:
```typescript
callbacks: {
  async signIn({ account, profile, user }) {
    if (account?.provider === "google") {
      const stateParam = /* extract from request */;

      if (stateParam) {
        // Linking flow
        const { telegramId } = verifyStateJWT(stateParam);
        await linkTelegramUserToGoogle(telegramId, user.id, account);
        return true; // Or redirect to Telegram app
      }
    }
    return true;
  }
}
```

**Step 3: Create linking function**

`src/lib/telegram/bot.ts`:
```typescript
export async function linkTelegramUserToGoogle(
  telegramId: number,
  googleUserId: string,
  googleAccount: Account
): Promise<void> {
  const client = await getMongoClient();

  // Find or create user with telegramId
  const user = await client.db().collection("users").findOne({ telegramId });

  if (user) {
    // Update existing user with Google data
    await client.db().collection("users").updateOne(
      { telegramId },
      { $set: {
        email: googleAccount.email,
        googleUserId,
        updatedAt: new Date()
      }}
    );

    // Update or insert Google account linked to this user
    await client.db().collection("accounts").updateOne(
      { userId: user._id, provider: "google" },
      { $set: { ...googleAccount } },
      { upsert: true }
    );
  }
}
```

**Step 4: Add UI in Telegram Mini App**

`src/features/telegram/components/telegram-mini-app-authenticated.tsx`:
```tsx
<Button onClick={handleConnectGoogle}>
  Connect Google Calendar
</Button>

async function handleConnectGoogle() {
  const telegramId = /* from auth */;
  window.location.href = `/api/auth/google/link?telegramId=${telegramId}`;
}
```

---

## Security Considerations

### State Token
- Must be JWT signed with `AUTH_SECRET`
- Include nonce to prevent replay attacks
- Short expiry (5 minutes)
- Single-use (store in Redis or DB, mark as consumed)

### Telegram Verification
- Verify Telegram JWT before initiating OAuth
- Ensure telegramId can't be spoofed
- Only allow linking if Telegram auth is valid

### Account Takeover Prevention
- If Google email already exists in users collection, require additional verification
- Consider email verification step
- Log all linking events for audit

---

## Testing Strategy

### Backend Token Refresh
```bash
# Create test user with expired Google token
# Run backend agent
# Verify token auto-refreshes
# Verify updated in DB
```

### Telegram Linking
```bash
# 1. Auth as Telegram user
# 2. Click "Connect Google"
# 3. Complete OAuth flow
# 4. Verify accounts collection has entry
# 5. Test calendar access from Telegram chat
```

### Dev Test User
```bash
# 1. Create MongoDB account for test user 999000000
# 2. Use MCP_DEVELOPMENT_API_KEY
# 3. Verify token fetched from DB
# 4. Let token expire, verify auto-refresh
```

---

## Migration Path

1. ✅ **Phase 1** (Week 1): Backend token refresh utility
2. ✅ **Phase 2** (Week 1): Update backend tools + dev auth
3. ✅ **Phase 3** (Week 2): Telegram-Google linking flow
4. ✅ **Testing** (Week 2): End-to-end testing
5. ✅ **Documentation** (Week 2): Update README + .env.sample

---

## Environment Variables

Add to `.env.sample`:

```bash
# Google OAuth (existing)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Optional: Fallback for dev if no DB account
PERSONAL_GOOGLE_ACCESS_TOKEN_FOR_TESTING=ya29...

# For dev test user (if no Google account in DB)
MCP_DEV_TEST_USER_ID=999000000
```

---

## Database Indexes

Ensure these indexes exist:

```typescript
// accounts collection
db.accounts.createIndex({ userId: 1, provider: 1 });

// users collection
db.users.createIndex({ telegramId: 1 });
db.users.createIndex({ email: 1 });
```

---

## Error Handling

### Token Refresh Failures
- Log to monitoring system
- Fall back to requiring re-authentication
- Notify user via Telegram if refresh fails

### Linking Failures
- Show clear error messages
- Allow retry
- Provide support contact

### Rate Limiting
- Google OAuth has rate limits
- Cache tokens aggressively
- Use refresh token sparingly (only when expired)

---

## Future Enhancements

1. **Token revocation**: Allow users to disconnect Google account
2. **Multi-provider**: Support Microsoft, Outlook calendars
3. **Scope management**: Request only needed calendar scopes
4. **Token encryption**: Encrypt tokens at rest in MongoDB
5. **Monitoring**: Track token refresh success rates
