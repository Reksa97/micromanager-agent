import OpenAI from "openai";

import { env } from "@/env";
import { Agent, run } from "@openai/agents";

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  project: env.OPENAI_PROJECT,
});

export { Agent as OpenAIAgent, run as runOpenAIAgent };
