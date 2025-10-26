import { ObjectId, Collection } from "mongodb";
import { getMongoClient } from "./db";

/**
 * Type-safe helpers for querying the accounts collection.
 *
 * IMPORTANT: The accounts collection ALWAYS stores userId as ObjectId.
 * This is the NextAuth MongoDB adapter standard.
 * Source: https://github.com/nextauthjs/next-auth/blob/main/packages/adapter-mongodb/src/index.ts
 *
 * These helpers enforce ObjectId usage at compile-time to prevent bugs.
 */

export interface AccountDocument {
  _id: ObjectId;
  userId: ObjectId; // ALWAYS ObjectId, never string
  type: string;
  provider: string;
  providerAccountId: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
  id_token?: string;
  session_state?: string;
}

/**
 * Get the accounts collection with proper typing
 */
async function getAccountsCollection(): Promise<Collection<AccountDocument>> {
  const client = await getMongoClient();
  return client.db().collection<AccountDocument>("accounts");
}

/**
 * Find an account by userId (as string) and provider.
 * Automatically converts userId string to ObjectId.
 *
 * @param userId - User ID as string (will be converted to ObjectId)
 * @param provider - Provider name (e.g., "google")
 * @returns Account document or null
 */
export async function findAccountByUserId(
  userId: string,
  provider: string
): Promise<AccountDocument | null> {
  const collection = await getAccountsCollection();

  return collection.findOne({
    userId: new ObjectId(userId),
    provider,
  });
}

/**
 * Update an account by userId and provider.
 * Automatically converts userId string to ObjectId.
 *
 * @param userId - User ID as string (will be converted to ObjectId)
 * @param provider - Provider name
 * @param update - Update operations
 */
export async function updateAccountByUserId(
  userId: string,
  provider: string,
  update: Partial<Omit<AccountDocument, "_id" | "userId">>
) {
  const collection = await getAccountsCollection();

  return collection.updateOne(
    {
      userId: new ObjectId(userId),
      provider,
    },
    { $set: update }
  );
}

/**
 * Upsert an account by userId and provider.
 * IMPORTANT: userId will be stored as ObjectId in the database.
 *
 * @param userId - User ID as string (will be converted to ObjectId)
 * @param provider - Provider name
 * @param accountData - Account data to upsert
 */
export async function upsertAccount(
  userId: string,
  provider: string,
  accountData: Omit<AccountDocument, "_id" | "userId">
) {
  const collection = await getAccountsCollection();

  return collection.updateOne(
    {
      userId: new ObjectId(userId),
      provider,
    },
    {
      $set: {
        userId: new ObjectId(userId),
        ...accountData,
      },
    },
    { upsert: true }
  );
}

/**
 * Delete an account by userId and provider.
 *
 * @param userId - User ID as string (will be converted to ObjectId)
 * @param provider - Provider name
 */
export async function deleteAccountByUserId(
  userId: string,
  provider: string
) {
  const collection = await getAccountsCollection();

  return collection.deleteOne({
    userId: new ObjectId(userId),
    provider,
  });
}

/**
 * Check if a user has an account linked for a provider.
 *
 * @param userId - User ID as string
 * @param provider - Provider name
 * @returns True if account exists, false otherwise
 */
export async function hasAccountLinked(
  userId: string,
  provider: string
): Promise<boolean> {
  const account = await findAccountByUserId(userId, provider);
  return account !== null;
}
