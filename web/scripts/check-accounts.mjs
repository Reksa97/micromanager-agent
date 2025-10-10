#!/usr/bin/env node
import { config } from "dotenv";
import { MongoClient } from "mongodb";

config();

const client = new MongoClient(process.env.MONGODB_URI);

async function checkAccounts() {
  await client.connect();
  const db = client.db();

  console.log("\n📊 Checking database contents...\n");

  // Find all users
  const users = await db.collection("users").find({}).toArray();
  console.log(`Found ${users.length} users:`);
  users.forEach((user, i) => {
    console.log(`  ${i + 1}. ${user.name} (email: ${user.email}, telegramId: ${user.telegramId}, _id: ${user._id})`);
  });

  // Find all accounts
  const accounts = await db.collection("accounts").find({}).toArray();
  console.log(`\nFound ${accounts.length} accounts:`);
  accounts.forEach((acc, i) => {
    console.log(`  ${i + 1}. Provider: ${acc.provider}, User ID: ${acc.userId}, Has tokens: ${!!acc.access_token && !!acc.refresh_token}`);
  });

  await client.close();
}

checkAccounts().catch(console.error);
