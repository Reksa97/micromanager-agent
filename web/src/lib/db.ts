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

// Global caching for serverless environments
const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
  _mongoClient?: MongoClient;
};

if (!globalWithMongo._mongoClientPromise) {
  const newClient = new MongoClient(uri, options);
  globalWithMongo._mongoClient = newClient;
  globalWithMongo._mongoClientPromise = newClient.connect();
}

const client = globalWithMongo._mongoClient!;
const clientPromise = globalWithMongo._mongoClientPromise!;

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
      const reconnectClient = new MongoClient(uri, options);
      const newClientPromise = reconnectClient.connect();
      globalWithMongo._mongoClient = reconnectClient;
      globalWithMongo._mongoClientPromise = newClientPromise;
      return await newClientPromise;
    } catch (reconnectError) {
      console.error("MongoDB reconnection failed:", reconnectError);
      throw reconnectError;
    }
  }
}
