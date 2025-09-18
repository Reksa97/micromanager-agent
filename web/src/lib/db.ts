import { MongoClient, MongoClientOptions, ServerApiVersion } from "mongodb";

import { env } from "@/env";

const uri = env.MONGODB_URI;

const options: MongoClientOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  // Critical: Disable automatic IP family selection to prevent SSL errors
  autoSelectFamily: false,
  // Standard options for MongoDB Atlas
  retryWrites: true,
  w: "majority",
};

// Global caching for serverless environments (Vercel pattern)
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable to preserve the value
  // across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Export a module-scoped MongoClient promise for serverless efficiency
export default clientPromise;

export async function getMongoClient() {
  try {
    const client = await clientPromise;
    // Ping to verify connection
    await client.db("admin").command({ ping: 1 });
    return client;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}
