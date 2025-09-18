import { MongoClient, MongoClientOptions, ServerApiVersion } from "mongodb";

import { env } from "@/env";

const uri = env.MONGODB_URI;

const options: MongoClientOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  // Fix for Vercel deployment SSL issues
  tls: true,
  tlsAllowInvalidCertificates: false,
  retryWrites: true,
  w: "majority",
};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

// Global caching for serverless environments
const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

if (process.env.NODE_ENV === "development") {
  // In development, use a global variable to preserve connection
  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production, cache the promise on global to reuse across invocations
  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
}

export default client;

export async function getMongoClient() {
  try {
    // Ensure client is connected
    const connectedClient = await clientPromise;

    // Ping to check connection health
    await connectedClient.db().command({ ping: 1 });

    return connectedClient;
  } catch (error) {
    console.error("MongoDB connection error:", error);

    // Try to reconnect once
    try {
      client = new MongoClient(uri, options);
      const newClientPromise = client.connect();
      globalWithMongo._mongoClientPromise = newClientPromise;
      return await newClientPromise;
    } catch (reconnectError) {
      console.error("MongoDB reconnection failed:", reconnectError);
      throw reconnectError;
    }
  }
}
