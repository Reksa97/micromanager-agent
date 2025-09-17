import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { ObjectId } from "mongodb";

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

type AdapterUser = {
  _id: ObjectId;
  id: string;
  email?: string | null;
  emailVerified?: Date | null;
  image?: string | null;
  name?: string | null;
  password?: string | null;
  role?: "user" | "admin";
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
        if (!credentials?.email || !credentials.password) {
          console.warn("[auth][credentials] missing email/password field");
          return null;
        }

        const client = await clientPromise;
        const normalizedEmail = credentials.email.trim().toLowerCase();
        const normalizedPassword = credentials.password.trim();
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
          console.warn("[auth][credentials] user missing password hash", normalizedEmail);
          return null;
        }

        const isValid = await verifyPassword(normalizedPassword, user.password);

        if (!isValid) {
          console.warn("[auth][credentials] password mismatch", normalizedEmail);
          return null;
        }

        return {
          id: user.id ?? user._id.toString(),
          email: user.email ?? normalizedEmail,
          name: user.name ?? normalizedEmail.split("@")[0],
          role: user.role ?? "user",
        } satisfies Partial<User> as User;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const typedUser = user as User;
        token.sub = typedUser.id;
        (token as JWT).role = typedUser.role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token as JWT).role ?? "user";
      }
      return session;
    },
  },
});
