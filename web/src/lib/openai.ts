import OpenAI from "openai";

import { env } from "@/env";

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  project: env.OPENAI_PROJECT,
});

export const MODELS = {
  realtime: process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview-2024-12-17",
  text: process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini",
};
