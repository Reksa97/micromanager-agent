import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MODELS = {
  realtime: "gpt-realtime",
  text: "gpt-5-mini",
  textBudget: "gpt-4o", //"gpt-5-nano",
};
