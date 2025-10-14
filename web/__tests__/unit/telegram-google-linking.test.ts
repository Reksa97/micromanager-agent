import { linkTelegramUserToGoogle } from "@/lib/telegram/bot";
import { getMongoClient } from "@/lib/db";

// Mock jose before importing
jest.mock("jose", () => ({
  SignJWT: jest.fn().mockImplementation((payload: any) => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue("mock-jwt-token"),
  })),
  jwtVerify: jest.fn(),
}));

// Mock dependencies
jest.mock("@/lib/db");
jest.mock("@/env", () => ({
  env: {
    JWT_SECRET: new TextEncoder().encode("test-secret"),
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  },
}));

describe("Telegram-Google Linking", () => {
  let mockUsersCollection: any;
  let mockAccountsCollection: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUsersCollection = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };

    mockAccountsCollection = {
      updateOne: jest.fn(),
    };

    const mockDb = {
      collection: jest.fn((name: string) => {
        if (name === "users") return mockUsersCollection;
        if (name === "accounts") return mockAccountsCollection;
        return null;
      }),
    };

    const mockClient = {
      db: jest.fn().mockReturnValue(mockDb),
    };

    (getMongoClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe("linkTelegramUserToGoogle", () => {
    const telegramId = 123456;
    const mockUser = {
      _id: { toString: () => "user-id-123" },
      telegramId,
      name: "Test User",
    };

    const mockGoogleAccount = {
      providerAccountId: "google-123",
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "Bearer",
      scope: "openid email profile https://www.googleapis.com/auth/calendar",
      id_token: "test-id-token",
      email: "test@example.com",
    };

    it("should link Telegram user to Google account", async () => {
      mockUsersCollection.findOne.mockResolvedValue(mockUser);

      await linkTelegramUserToGoogle(telegramId, mockGoogleAccount);

      // Should find user by telegramId
      expect(mockUsersCollection.findOne).toHaveBeenCalledWith({ telegramId });

      // Should update user with email
      expect(mockUsersCollection.updateOne).toHaveBeenCalledWith(
        { _id: mockUser._id },
        {
          $set: {
            email: mockGoogleAccount.email,
            updatedAt: expect.any(Date),
          },
        }
      );

      // Should upsert Google account
      expect(mockAccountsCollection.updateOne).toHaveBeenCalledWith(
        { userId: "user-id-123", provider: "google" },
        {
          $set: {
            userId: "user-id-123",
            type: "oauth",
            provider: "google",
            providerAccountId: mockGoogleAccount.providerAccountId,
            access_token: mockGoogleAccount.access_token,
            refresh_token: mockGoogleAccount.refresh_token,
            expires_at: mockGoogleAccount.expires_at,
            token_type: mockGoogleAccount.token_type,
            scope: mockGoogleAccount.scope,
            id_token: mockGoogleAccount.id_token,
          },
        },
        { upsert: true }
      );
    });

    it("should throw error if user not found", async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      await expect(
        linkTelegramUserToGoogle(telegramId, mockGoogleAccount)
      ).rejects.toThrow(`No user found with telegramId: ${telegramId}`);
    });

    it("should handle linking without email", async () => {
      mockUsersCollection.findOne.mockResolvedValue(mockUser);

      const accountWithoutEmail = { ...mockGoogleAccount };
      delete accountWithoutEmail.email;

      await linkTelegramUserToGoogle(telegramId, accountWithoutEmail);

      // Should not try to update email
      expect(mockUsersCollection.updateOne).not.toHaveBeenCalled();

      // Should still create account
      expect(mockAccountsCollection.updateOne).toHaveBeenCalled();
    });

    it("should update existing Google account", async () => {
      mockUsersCollection.findOne.mockResolvedValue(mockUser);

      const updatedAccount = {
        ...mockGoogleAccount,
        access_token: "new-access-token",
      };

      await linkTelegramUserToGoogle(telegramId, updatedAccount);

      expect(mockAccountsCollection.updateOne).toHaveBeenCalledWith(
        { userId: "user-id-123", provider: "google" },
        {
          $set: expect.objectContaining({
            access_token: "new-access-token",
          }),
        },
        { upsert: true }
      );
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete linking flow", async () => {
      const telegramId = 123456;
      const mockUser = {
        _id: { toString: () => "user-id-123" },
        telegramId,
        name: "Test User",
      };

      mockUsersCollection.findOne.mockResolvedValue(mockUser);

      // Link accounts
      await linkTelegramUserToGoogle(telegramId, {
        providerAccountId: "google-123",
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "Bearer",
        scope: "openid email profile",
        email: "test@example.com",
      });

      expect(mockAccountsCollection.updateOne).toHaveBeenCalled();
    });
  });
});
