import dotenv from "dotenv";
dotenv.config();

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const TEST_USERS = {
  user1: {
    name: "Calendar Test User Name",
    email: process.env.TEST_USER1_EMAIL ?? "chatuser@e2e.local",
    password: process.env.TEST_USER1_PASSWORD ?? "TestPassword123!",
    tier: "free",
  },
  user2: {
    name: "Calendar Test User Name 2",
    email: process.env.TEST_USER2_EMAIL ?? "chatuser2@e2e.local",
    password: process.env.TEST_USER2_PASSWORD ?? "TestPassword123!",
    tier: "paid",
  },
};