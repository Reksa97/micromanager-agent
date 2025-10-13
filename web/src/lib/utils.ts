import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MODELS = {
  realtime: "gpt-realtime" as const,
  text: "gpt-5-mini-2025-08-07" as const,
  textBudget: "gpt-5-nano" as const,
};
