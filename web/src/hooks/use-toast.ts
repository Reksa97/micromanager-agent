// Simple toast hook for notification feedback
export function useToast() {
  return {
    toast: ({ title, description, variant }: {
      title: string;
      description?: string;
      variant?: "default" | "destructive";
    }) => {
      // Simple console feedback for now
      // Can be replaced with proper toast UI later
      if (variant === "destructive") {
        console.error(`[Toast] ${title}: ${description}`);
      } else {
        console.log(`[Toast] ${title}: ${description}`);
      }

      // Show browser notification if available
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification(title, { body: description });
        }
      }
    },
  };
}
