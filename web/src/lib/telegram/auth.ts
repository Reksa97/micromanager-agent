import { jwtVerify, SignJWT } from "jose";
import { env } from "@/env";

export async function generateTelegramServerToken() {
  const secret = new TextEncoder().encode(env.TELEGRAM_SERVER_SECRET);

  return await new SignJWT({ role: "telegram-service" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m") // short-lived token
    .sign(secret);
}

export async function verifyTelegramServerToken(token: string) {
  const secret = new TextEncoder().encode(env.TELEGRAM_SERVER_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload.role === "telegram-service";
}