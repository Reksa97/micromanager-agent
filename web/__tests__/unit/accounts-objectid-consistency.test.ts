import { ObjectId } from "mongodb";
import {
  findAccountByUserId,
  updateAccountByUserId,
  upsertAccount,
  deleteAccountByUserId,
  hasAccountLinked,
  AccountDocument,
} from "@/lib/accounts-helpers";
import { getMongoClient } from "@/lib/db";

// Mock MongoDB client
jest.mock("@/lib/db");

describe("Accounts Collection - ObjectId Consistency", () => {
  let mockCollection: any;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MongoDB collection with proper structure
    mockCollection = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    };

    mockClient = {
      db: jest.fn().mockReturnValue(mockDb),
    };

    (getMongoClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe("findAccountByUserId", () => {
    it("should query with ObjectId, not string", async () => {
      const testUserId = "507f1f77bcf86cd799439011";
      const expectedObjectId = new ObjectId(testUserId);

      mockCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId: expectedObjectId,
        provider: "google",
        type: "oauth",
        providerAccountId: "12345",
      });

      await findAccountByUserId(testUserId, "google");

      // Verify findOne was called with ObjectId
      expect(mockCollection.findOne).toHaveBeenCalledWith({
        userId: expectedObjectId,
        provider: "google",
      });

      // Verify it was NOT called with string
      expect(mockCollection.findOne).not.toHaveBeenCalledWith({
        userId: testUserId, // String format is WRONG
        provider: "google",
      });
    });

    it("should handle valid ObjectId strings", async () => {
      const validObjectIdString = new ObjectId().toString();
      mockCollection.findOne.mockResolvedValue(null);

      await findAccountByUserId(validObjectIdString, "google");

      expect(mockCollection.findOne).toHaveBeenCalled();
      const callArgs = mockCollection.findOne.mock.calls[0][0];
      expect(callArgs.userId).toBeInstanceOf(ObjectId);
    });

    it("should return null when account not found", async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await findAccountByUserId("507f1f77bcf86cd799439011", "google");

      expect(result).toBeNull();
    });
  });

  describe("updateAccountByUserId", () => {
    it("should update with ObjectId query, not string", async () => {
      const testUserId = "507f1f77bcf86cd799439011";
      const expectedObjectId = new ObjectId(testUserId);
      const updateData = { access_token: "new-token" };

      mockCollection.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      await updateAccountByUserId(testUserId, "google", updateData);

      // Verify update query uses ObjectId
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        {
          userId: expectedObjectId,
          provider: "google",
        },
        { $set: updateData }
      );
    });
  });

  describe("upsertAccount", () => {
    it("should upsert with userId as ObjectId, not string", async () => {
      const testUserId = "507f1f77bcf86cd799439011";
      const expectedObjectId = new ObjectId(testUserId);

      const accountData = {
        type: "oauth",
        provider: "google",
        providerAccountId: "12345",
        access_token: "token",
        refresh_token: "refresh",
      } as Omit<AccountDocument, "_id" | "userId">;

      mockCollection.updateOne.mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
      });

      await upsertAccount(testUserId, "google", accountData);

      // Verify query uses ObjectId
      const queryArg = mockCollection.updateOne.mock.calls[0][0];
      expect(queryArg.userId).toEqual(expectedObjectId);
      expect(queryArg.userId).toBeInstanceOf(ObjectId);

      // Verify $set uses ObjectId
      const setArg = mockCollection.updateOne.mock.calls[0][1].$set;
      expect(setArg.userId).toEqual(expectedObjectId);
      expect(setArg.userId).toBeInstanceOf(ObjectId);

      // Verify NOT string
      expect(typeof setArg.userId).not.toBe("string");
    });
  });

  describe("deleteAccountByUserId", () => {
    it("should delete with ObjectId query", async () => {
      const testUserId = "507f1f77bcf86cd799439011";
      const expectedObjectId = new ObjectId(testUserId);

      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await deleteAccountByUserId(testUserId, "google");

      expect(mockCollection.deleteOne).toHaveBeenCalledWith({
        userId: expectedObjectId,
        provider: "google",
      });
    });
  });

  describe("hasAccountLinked", () => {
    it("should return true when account exists", async () => {
      mockCollection.findOne.mockResolvedValue({
        _id: new ObjectId(),
        userId: new ObjectId("507f1f77bcf86cd799439011"),
        provider: "google",
      });

      const result = await hasAccountLinked("507f1f77bcf86cd799439011", "google");

      expect(result).toBe(true);
    });

    it("should return false when account does not exist", async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await hasAccountLinked("507f1f77bcf86cd799439011", "google");

      expect(result).toBe(false);
    });
  });

  describe("NextAuth Compatibility", () => {
    it("should match NextAuth adapter's ObjectId storage format", async () => {
      // This test verifies our helpers match NextAuth's behavior
      const userId = "507f1f77bcf86cd799439011";
      const userIdAsObjectId = new ObjectId(userId);

      // NextAuth stores userId as ObjectId (verified from source)
      const nextAuthFormat = {
        userId: userIdAsObjectId, // ObjectId, not string
        provider: "google",
        type: "oauth",
        providerAccountId: "12345",
      };

      mockCollection.findOne.mockResolvedValue(nextAuthFormat);

      await findAccountByUserId(userId, "google");

      // Verify our helper queries with same format as NextAuth stores
      const queryArg = mockCollection.findOne.mock.calls[0][0];
      expect(queryArg.userId).toBeInstanceOf(ObjectId);
      expect(queryArg.userId.toString()).toBe(userId);
    });
  });

  describe("Negative Tests - String userId should NOT work", () => {
    it("should convert string to ObjectId, never query with raw string", async () => {
      const stringUserId = "507f1f77bcf86cd799439011";

      mockCollection.findOne.mockResolvedValue(null);

      await findAccountByUserId(stringUserId, "google");

      // Get the actual query that was made
      const actualQuery = mockCollection.findOne.mock.calls[0][0];

      // Verify userId is ObjectId
      expect(actualQuery.userId).toBeInstanceOf(ObjectId);

      // Verify it's NOT the raw string
      expect(actualQuery.userId).not.toBe(stringUserId);
      expect(typeof actualQuery.userId).not.toBe("string");
    });

    it("should throw error for invalid ObjectId strings", async () => {
      const invalidUserId = "not-a-valid-objectid";

      // ObjectId constructor throws for invalid strings
      await expect(
        findAccountByUserId(invalidUserId, "google")
      ).rejects.toThrow();
    });
  });

  describe("Type Safety", () => {
    it("should enforce userId is string parameter (will be converted)", async () => {
      // This is a compile-time test - TypeScript won't allow non-string
      const userId: string = "507f1f77bcf86cd799439011";

      mockCollection.findOne.mockResolvedValue(null);

      // Should compile and run without errors
      await findAccountByUserId(userId, "google");

      expect(mockCollection.findOne).toHaveBeenCalled();
    });

    it("should return properly typed AccountDocument", async () => {
      const mockAccount: AccountDocument = {
        _id: new ObjectId(),
        userId: new ObjectId("507f1f77bcf86cd799439011"),
        type: "oauth",
        provider: "google",
        providerAccountId: "12345",
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Date.now() + 3600000,
        token_type: "Bearer",
        scope: "profile email",
      };

      mockCollection.findOne.mockResolvedValue(mockAccount);

      const result = await findAccountByUserId("507f1f77bcf86cd799439011", "google");

      // TypeScript should enforce correct types
      expect(result).toBeDefined();
      expect(result?.userId).toBeInstanceOf(ObjectId);
      expect(result?.provider).toBe("google");
    });
  });
});
