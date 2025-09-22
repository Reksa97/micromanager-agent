import { motion } from "framer-motion";
import { Sparkles, User, Bot, AlertTriangle } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/features/chat/types";

const icons = {
  user: User,
  assistant: Bot,
  system: Sparkles,
  tool: Sparkles,
};

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const Icon = icons[message.role] ?? Sparkles;
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className={cn("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <Avatar className="h-9 w-9 border border-border/70">
          <AvatarFallback className="bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}

      <div className={cn("max-w-[75%] space-y-1", isUser ? "items-end text-right" : "items-start text-left")}
      >
        <div
          className={cn(
            "relative rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted/70 text-muted-foreground ring-1 ring-border/40 backdrop-blur",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {message.error && (
            <div className="mt-2 flex items-center gap-2 text-xs text-destructive-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              {message.error}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground/60">
          <Badge variant={isAssistant ? "secondary" : "muted"} className="border-none px-2 py-0 text-[10px] uppercase tracking-widest">
            {isUser ? "You" : message.role === "assistant" ? "Micromanager" : message.role}
          </Badge>
          {message.kind === "audio" && <span>voice</span>}
        </div>
      </div>

      {isUser && (
        <Avatar className="h-9 w-9 border border-border/70">
          <AvatarFallback className="bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
}
