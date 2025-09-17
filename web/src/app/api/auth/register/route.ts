"server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/env";
import { getMongoClient } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
});

export async function POST(request: Request) {
  if (!env.ALLOW_USER_REGISTRATION) {
    return NextResponse.json(
      { error: "User registration is disabled in this environment" },
      { status: 403 }
    );
  }

  const json = await request.json().catch(() => null);
  const parseResult = bodySchema.safeParse(json);

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        details: parseResult.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const { email, password, name } = parseResult.data;
  const normalizedEmail = email.toLowerCase();

  const client = await getMongoClient();
  const db = client.db();
  const users = db.collection("users");
  await users.createIndex({ email: 1 }, { unique: true });

  const existingUser = await users.findOne({ email: normalizedEmail });
  if (existingUser) {
    return NextResponse.json(
      { error: "Email already in use" },
      { status: 409 }
    );
  }

  const hashedPassword = await hashPassword(password);
  const now = new Date();

  const { insertedId } = await users.insertOne({
    id: undefined,
    email: normalizedEmail,
    emailVerified: null,
    name,
    password: hashedPassword,
    role: "user",
    image: null,
    createdAt: now,
    updatedAt: now,
  });

  await users.updateOne(
    { _id: insertedId },
    { $set: { id: insertedId.toString() } }
  );

  return NextResponse.json({ id: insertedId.toString() }, { status: 201 });
}
