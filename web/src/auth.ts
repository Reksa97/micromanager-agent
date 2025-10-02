import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { google } from "googleapis";

import { env } from "@/env";
import clientPromise from "@/lib/db";
import { verifyPassword } from "@/lib/password";

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

async function refreshGoogleAccessToken(token: JWT) {
  try {
    const oAuth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET
    );

    oAuth2Client.setCredentials({
      refresh_token: token.googleRefreshToken,
    });

    const { credentials } = await oAuth2Client.refreshAccessToken();
    return {
      ...token,
      googleAccessToken: credentials.access_token,
      googleRefreshToken: credentials.refresh_token ?? token.googleRefreshToken,
      googleExpires: credentials.expiry_date ?? Date.now() + 3600 * 1000,
      error: undefined,
    };
  } catch (error) {
    console.error("Error refreshing Google access token", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
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
          return null;
        }

        const client = await clientPromise;
        const normalizedEmail = parsed.data.email.toLowerCase();
        const normalizedPassword = parsed.data.password;
        const user = await client
          .db()
          .collection<AdapterUser>("users")
          .findOne({ email: normalizedEmail });

        if (!user) {
          return null;
        }

        if (!user.password) {
          return null;
        }

        const isValid = await verifyPassword(normalizedPassword, user.password);

        if (!isValid) {
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
    Google({
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        const typedUser = user as User;
        token.sub = typedUser.id;
        (token as JWT).tier = typedUser.tier ?? "free";

        if (account.provider === "google") {
          token.googleAccessToken = account.access_token;
          token.googleRefreshToken =
            account.refresh_token ?? token.googleRefreshToken;
          token.googleExpires = Date.now() + (account.expires_in ?? 0) * 1000;
          return token;
        }
      }

      console.log(
        `Token expires in: ${
          ((token.googleExpires ?? 0) - Date.now()) / 60000
        } minutes`
      );

      if (token.googleExpires && Date.now() < token.googleExpires - 60 * 1000) {
        return token;
      }
      console.log("Access token expired, refreshing...");
      return await refreshGoogleAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.tier = (token as JWT).tier ?? "free";
      }

      session.googleAccessToken = token.googleAccessToken;
      session.googleRefreshToken = token.googleRefreshToken;
      session.googleExpires = token.googleExpires;

      return session;
    },
  },
});
