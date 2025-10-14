import {
  getUserGoogleTokens,
  refreshUserGoogleToken,
  getGoogleAccessToken,
  isTokenExpired,
} from "@/lib/google-tokens";
import { getMongoClient } from "@/lib/db";
import { google } from "googleapis";

// Mock dependencies
jest.mock("@/lib/db");
jest.mock("googleapis");
jest.mock("@/env", () => ({
  env: {
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  },
}));

describe("Google Tokens Utility", () => {
  let mockCollection: any;
  let mockOAuth2Client: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MongoDB collection
    mockCollection = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };

    const mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    };

    const mockClient = {
      db: jest.fn().mockReturnValue(mockDb),
    };

    (getMongoClient as jest.Mock).mockResolvedValue(mockClient);

    // Mock Google OAuth2 client
    mockOAuth2Client = {
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
    };

    (google.auth.OAuth2 as any as jest.Mock) = jest
      .fn()
      .mockReturnValue(mockOAuth2Client);
  });

  describe("isTokenExpired", () => {
    it("should return true if token is expired", () => {
      const expiredTime = Math.floor(Date.now() / 1000) - 1000; // 1000 seconds ago
      expect(isTokenExpired(expiredTime)).toBe(true);
    });

    it("should return true if token expires within 5 minutes", () => {
      const soonToExpire = Math.floor(Date.now() / 1000) + 240; // 4 minutes from now
      expect(isTokenExpired(soonToExpire)).toBe(true);
    });

    it("should return false if token expires in more than 5 minutes", () => {
      const validTime = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
      expect(isTokenExpired(validTime)).toBe(false);
    });

    it("should handle edge case at exactly 5 minutes", () => {
      const exactlyFiveMinutes = Math.floor(Date.now() / 1000) + 300; // Exactly 5 minutes
      expect(isTokenExpired(exactlyFiveMinutes)).toBe(true);
    });
  });

  describe("getUserGoogleTokens", () => {
    const mockUserId = "test-user-123";
    const mockAccount = {
      userId: mockUserId,
      provider: "google",
      access_token: "valid-access-token",
      refresh_token: "valid-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    it("should return null if no Google account found", async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await getUserGoogleTokens(mockUserId);

      expect(result).toBeNull();
      expect(mockCollection.findOne).toHaveBeenCalledWith({
        userId: mockUserId,
        provider: "google",
      });
    });

    it("should return tokens without refresh if token is still valid", async () => {
      mockCollection.findOne.mockResolvedValue(mockAccount);

      const result = await getUserGoogleTokens(mockUserId);

      expect(result).toEqual({
        accessToken: mockAccount.access_token,
        refreshToken: mockAccount.refresh_token,
        expiresAt: mockAccount.expires_at,
      });
      expect(mockOAuth2Client.refreshAccessToken).not.toHaveBeenCalled();
    });

    it("should refresh token if expired and update database", async () => {
      const expiredAccount = {
        ...mockAccount,
        expires_at: Math.floor(Date.now() / 1000) - 1000, // Expired
      };
      mockCollection.findOne.mockResolvedValue(expiredAccount);

      const newAccessToken = "new-access-token";
      const newExpiresAt = Math.floor(Date.now() / 1000) + 3600;
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: newAccessToken,
          expiry_date: newExpiresAt * 1000, // Google returns milliseconds
        },
      });

      const result = await getUserGoogleTokens(mockUserId);

      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: expiredAccount.refresh_token,
        expiresAt: newExpiresAt,
      });

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        refresh_token: expiredAccount.refresh_token,
      });
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { userId: mockUserId, provider: "google" },
        {
          $set: {
            access_token: newAccessToken,
            expires_at: newExpiresAt,
          },
        }
      );
    });

    it("should handle refresh token failure gracefully", async () => {
      const expiredAccount = {
        ...mockAccount,
        expires_at: Math.floor(Date.now() / 1000) - 1000,
      };
      mockCollection.findOne.mockResolvedValue(expiredAccount);
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(
        new Error("Refresh failed")
      );

      const result = await getUserGoogleTokens(mockUserId);

      expect(result).toBeNull();
    });

    it("should handle missing expiry_date from Google response", async () => {
      const expiredAccount = {
        ...mockAccount,
        expires_at: Math.floor(Date.now() / 1000) - 1000,
      };
      mockCollection.findOne.mockResolvedValue(expiredAccount);

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "new-token",
          // No expiry_date
        },
      });

      const result = await getUserGoogleTokens(mockUserId);

      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe("new-token");
      // Should default to ~1 hour from now
      expect(result?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe("refreshUserGoogleToken", () => {
    const mockUserId = "test-user-123";
    const mockAccount = {
      userId: mockUserId,
      provider: "google",
      access_token: "old-access-token",
      refresh_token: "valid-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };

    it("should return null if no Google account found", async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await refreshUserGoogleToken(mockUserId);

      expect(result).toBeNull();
    });

    it("should force refresh token even if not expired", async () => {
      mockCollection.findOne.mockResolvedValue(mockAccount);

      const newAccessToken = "force-refreshed-token";
      const newExpiresAt = Math.floor(Date.now() / 1000) + 3600;
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: newAccessToken,
          expiry_date: newExpiresAt * 1000,
        },
      });

      const result = await refreshUserGoogleToken(mockUserId);

      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: mockAccount.refresh_token,
        expiresAt: newExpiresAt,
      });

      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(mockCollection.updateOne).toHaveBeenCalled();
    });

    it("should handle refresh failure", async () => {
      mockCollection.findOne.mockResolvedValue(mockAccount);
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(
        new Error("Invalid refresh token")
      );

      const result = await refreshUserGoogleToken(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe("getGoogleAccessToken", () => {
    const mockUserId = "test-user-123";

    it("should return access token if tokens are available", async () => {
      const mockAccount = {
        userId: mockUserId,
        provider: "google",
        access_token: "valid-access-token",
        refresh_token: "valid-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      mockCollection.findOne.mockResolvedValue(mockAccount);

      const result = await getGoogleAccessToken(mockUserId);

      expect(result).toBe("valid-access-token");
    });

    it("should return null if no tokens available", async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await getGoogleAccessToken(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe("Database interaction", () => {
    it("should query accounts collection with correct parameters", async () => {
      const userId = "user-123";
      mockCollection.findOne.mockResolvedValue(null);

      await getUserGoogleTokens(userId);

      expect(mockCollection.findOne).toHaveBeenCalledWith({
        userId,
        provider: "google",
      });
    });

    it("should update only access_token and expires_at fields", async () => {
      const userId = "user-123";
      const mockAccount = {
        userId,
        provider: "google",
        access_token: "old-token",
        refresh_token: "refresh-token",
        expires_at: Math.floor(Date.now() / 1000) - 1000,
        providerAccountId: "google-123",
        type: "oauth",
      };

      mockCollection.findOne.mockResolvedValue(mockAccount);
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "new-token",
          expiry_date: Date.now() + 3600000,
        },
      });

      await getUserGoogleTokens(userId);

      const updateCall = mockCollection.updateOne.mock.calls[0];
      expect(updateCall[1].$set).toEqual({
        access_token: "new-token",
        expires_at: expect.any(Number),
      });
      // Should not update refresh_token or other fields
      expect(updateCall[1].$set).not.toHaveProperty("refresh_token");
      expect(updateCall[1].$set).not.toHaveProperty("providerAccountId");
    });
  });

  describe("Error scenarios", () => {
    it("should handle database connection errors", async () => {
      (getMongoClient as jest.Mock).mockRejectedValue(
        new Error("DB connection failed")
      );

      const result = await getUserGoogleTokens("user-123");

      expect(result).toBeNull();
    });

    it("should handle malformed account data", async () => {
      mockCollection.findOne.mockResolvedValue({
        userId: "user-123",
        // Missing required fields
      });

      const result = await getUserGoogleTokens("user-123");

      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it("should handle Google API errors", async () => {
      const mockAccount = {
        userId: "user-123",
        provider: "google",
        refresh_token: "invalid-token",
        expires_at: Math.floor(Date.now() / 1000) - 1000,
      };
      mockCollection.findOne.mockResolvedValue(mockAccount);
      mockOAuth2Client.refreshAccessToken.mockRejectedValue({
        response: {
          data: {
            error: "invalid_grant",
            error_description: "Token has been expired or revoked.",
          },
        },
      });

      const result = await getUserGoogleTokens("user-123");

      expect(result).toBeNull();
    });
  });
});
