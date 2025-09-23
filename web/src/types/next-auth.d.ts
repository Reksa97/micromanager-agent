import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    tier?: "free" | "paid" | "admin";
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      tier?: "free" | "paid" | "admin";
    };
    googleAccessToken?: string | null;
    googleRefreshToken?: string | null;
    googleExpires?: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tier?: "free" | "paid" | "admin";
    googleAccessToken?: string | null;
    googleRefreshToken?: string | null;
    googleExpires?: number | null;
  }
}
