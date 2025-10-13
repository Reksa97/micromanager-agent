"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "light" | "dark";
type ThemeOption = Theme | "system";

type ThemeContextValue = {
  theme: Theme;
  selectedTheme: ThemeOption;
  setTheme: (theme: ThemeOption) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getSystemTheme = (): Theme => {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>("system");
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);

  // Hydrate theme selection from local storage and subscribe to system changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("theme");
    if (
      stored === "light" ||
      stored === "dark" ||
      stored === "system"
    ) {
      setSelectedTheme(stored);
    } else {
      setSelectedTheme("system");
    }

    if (!window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    // Initialize from current media query
    setSystemTheme(media.matches ? "dark" : "light");

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    // Fallback for older browsers
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  const resolvedTheme: Theme =
    selectedTheme === "system" ? systemTheme : selectedTheme;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("theme", selectedTheme);
  }, [selectedTheme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: resolvedTheme,
      selectedTheme,
      setTheme: (nextTheme) => setSelectedTheme(nextTheme),
      toggleTheme: () =>
        setSelectedTheme((prev) => {
          if (prev === "system") {
            return systemTheme === "dark" ? "light" : "dark";
          }
          return prev === "dark" ? "light" : "dark";
        }),
    }),
    [resolvedTheme, selectedTheme, systemTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
