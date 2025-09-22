import { tool } from "@openai/agents";
import { z } from "zod";

export const getWeatherTool = tool({
  name: "get_weather",
  description: "Get the weather for a given city",
  parameters: z.object({ city: z.string() }),
  async execute({ city }) {
    return `The weather in ${city} is sunny and 25 degrees Celsius.`;
  },
});
