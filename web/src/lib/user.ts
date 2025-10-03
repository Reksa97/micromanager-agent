import { ObjectId } from "mongodb";
import { getMongoClient } from "./db";

export const getUserByTelegramId = async (telegramId: number) => {
  const client = await getMongoClient();
  const usersCollection = client.db().collection("users");

  return usersCollection.findOne({
    telegramId,
  });
};

export const getUserById = async (userId: string) => {
  const client = await getMongoClient();
  const usersCollection = client.db().collection("users");
  return usersCollection.findOne({
    _id: new ObjectId(userId),
  });
};
