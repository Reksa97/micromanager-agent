import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { env } from "@/env";
import client from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const clientPromise = (async () => {
  try {
    await client.db().command({ ping: 1 });
  } catch {
    await client.connect();
  }
  return client;
})();

const credentialsSchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(1).trim(),
});

type AdapterUser = {
  _id: ObjectId;
  id: string;
  email?: string | null;
  emailVerified?: Date | null;
  image?: string | null;
  name?: string | null;
  password?: string | null;
  tier?: "free" | "paid" | "admin";
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: process.env.NODE_ENV === "development",
  trustHost: true,
  adapter: MongoDBAdapter(clientPromise),
  session: {
    strategy: "jwt",
  },
  secret: env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials ?? {});
        if (!parsed.success) {
          console.warn(
            "[auth][credentials] missing or invalid email/password field"
          );
          return null;
        }

        const client = await clientPromise;
        const normalizedEmail = parsed.data.email.toLowerCase();
        const normalizedPassword = parsed.data.password;
        console.warn("[auth][credentials] checking user", normalizedEmail);
        const user = await client
          .db()
          .collection<AdapterUser>("users")
          .findOne({ email: normalizedEmail });

        if (!user) {
          console.warn("[auth][credentials] user not found", normalizedEmail);
          return null;
        }

        if (!user.password) {
          console.warn(
            "[auth][credentials] user missing password hash",
            normalizedEmail
          );
          return null;
        }

        const isValid = await verifyPassword(normalizedPassword, user.password);

        if (!isValid) {
          console.warn(
            "[auth][credentials] password mismatch",
            normalizedEmail
          );
          return null;
        }

        return {
          id: user.id ?? user._id.toString(),
          email: user.email ?? normalizedEmail,
          name: user.name ?? normalizedEmail.split("@")[0],
          tier: user.tier ?? "free",
        } satisfies Partial<User> as User;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const typedUser = user as User;
        token.sub = typedUser.id;
        (token as JWT).tier = typedUser.tier ?? "free";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.tier = (token as JWT).tier ?? "free";
      }
      return session;
    },
  },
});
