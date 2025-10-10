"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, MessageSquare, Brain } from "lucide-react";
import { Card } from "@/components/ui/card";

interface FirstLoadExperienceProps {
  userName?: string;
  onComplete: () => void;
}

type LoadingStep = {
  id: string;
  label: string;
  icon: React.ReactNode;
  completed: boolean;
};

export function FirstLoadExperience({ userName, onComplete }: FirstLoadExperienceProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<LoadingStep[]>([
    {
      id: "analyzing",
      label: "Getting to know you...",
      icon: <Brain className="h-5 w-5" />,
      completed: false,
    },
    {
      id: "generating",
      label: "Preparing your assistant...",
      icon: <MessageSquare className="h-5 w-5" />,
      completed: false,
    },
    {
      id: "checking",
      label: "Setting up your experience...",
      icon: <Sparkles className="h-5 w-5" />,
      completed: false,
    },
    {
      id: "ready",
      label: "Almost ready...",
      icon: <Loader2 className="h-5 w-5" />,
      completed: false,
    },
  ]);

  useEffect(() => {
    const token = localStorage.getItem("telegram-token");
    if (!token) {
      console.error("[First Load] No token found");
      return;
    }

    let pollingInterval: NodeJS.Timeout | null = null;

    // Start polling immediately (don't wait for init to complete)
    const startPolling = () => {
      console.log("[First Load] Starting polling");

      pollingInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch("/api/first-load/status", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!statusResponse.ok) {
            throw new Error("Failed to get status");
          }

          const status = await statusResponse.json();

          // Update steps based on completed steps from backend
          setSteps((prev) =>
            prev.map((step) => ({
              ...step,
              completed: status.completedSteps.includes(step.id),
            }))
          );

          // Update current step count
          setCurrentStep(status.completedSteps.length);

          // If complete, stop polling and call onComplete
          if (status.isComplete) {
            if (pollingInterval) {
              clearInterval(pollingInterval);
            }
            setTimeout(() => {
              onComplete();
            }, 500);
          }
        } catch (error) {
          console.error("[First Load] Error polling status:", error);
        }
      }, 500); // Poll every 500ms
    };

    // Initialize first-load tasks (fire-and-forget)
    const initFirstLoad = async () => {
      try {
        const response = await fetch("/api/first-load/init", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to initialize first-load");
        }

        console.log("[First Load] Initialization complete");
      } catch (error) {
        console.error("[First Load] Error initializing:", error);
      }
    };

    // Start polling immediately and trigger init in parallel
    startPolling();
    initFirstLoad(); // Don't await - let it run in background

    // Cleanup
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [onComplete]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <Card className="w-full max-w-md border-2 border-primary/20 bg-white/80 p-8 shadow-2xl backdrop-blur-sm dark:bg-gray-800/80">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Sparkles className="h-12 w-12 text-primary animate-pulse" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome{userName ? `, ${userName}` : ""}!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Setting up your Micromanager experience
            </p>
          </div>

          {/* Progress Steps */}
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-all duration-500 ${
                  step.completed
                    ? "border-primary/50 bg-primary/5 scale-100"
                    : index === currentStep
                    ? "border-primary/30 bg-primary/10 scale-105"
                    : "border-border/30 bg-muted/20 scale-95 opacity-50"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    step.completed
                      ? "bg-primary text-primary-foreground"
                      : index === currentStep
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.completed ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : index === currentStep ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span
                  className={`text-sm font-medium transition-colors ${
                    step.completed || index === currentStep
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-1000 ease-out"
                style={{
                  width: `${(currentStep / steps.length) * 100}%`,
                }}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {currentStep} of {steps.length} complete
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
