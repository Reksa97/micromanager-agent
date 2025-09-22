import { MongoClient, MongoClientOptions, ServerApiVersion } from "mongodb";

import { env } from "@/env";

const uri = env.MONGODB_URI;

const options: MongoClientOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  // Prevents MongoDB Atlas SSL errors on Vercel
  autoSelectFamily: false,
  retryWrites: true,
  w: "majority",
};

// Global caching for serverless environments
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  // Use global variable for HMR in development
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

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
