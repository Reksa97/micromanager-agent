import { z } from "zod";

const serverSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  TELEGRAM_SERVER_SECRET: z.string().min(1, "TELEGRAM_SERVER_SECRET is required"),
  JWT_SECRET: z.instanceof(Uint8Array),
  OPENAI_PROJECT: z.string().optional(),
  ALLOW_USER_REGISTRATION: z.boolean(),
  TELEGRAM_DEV_MOCK_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const resolvedAuthSecret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "development" ? "dev-secret-change-me" : undefined);

const resolvedMongoUri =
  process.env.MONGODB_URI ??
  (process.env.NODE_ENV === "development" ? "" : undefined);

const allowUserRegistration = process.env.ALLOW_USER_REGISTRATION === "true";

if (!resolvedMongoUri) {
  throw new Error("Missing MONGODB_URI. Set it in your environment.");
}

if (
  process.env.NODE_ENV === "development" &&
  !process.env.AUTH_SECRET &&
  !process.env.NEXTAUTH_SECRET
) {
  console.warn(
    "AUTH_SECRET missing. Falling back to a development-only default. Set AUTH_SECRET in .env."
  );
}

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn(
    "GOOGLE_CLIENT_ID and/or GOOGLE_CLIENT_SECRET missing. Google oAuth authentication will not be possible."
  )
}

export const env = serverSchema.parse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  MONGODB_URI: resolvedMongoUri,
  AUTH_SECRET: resolvedAuthSecret,
  JWT_SECRET: new TextEncoder().encode(resolvedAuthSecret),
  OPENAI_PROJECT: process.env.OPENAI_PROJECT,
  ALLOW_USER_REGISTRATION: allowUserRegistration,
  TELEGRAM_DEV_MOCK_SECRET: process.env.TELEGRAM_DEV_MOCK_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  TELEGRAM_SERVER_SECRET: process.env.TELEGRAM_SERVER_SECRET,
});
