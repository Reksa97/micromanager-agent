"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return <SonnerToaster richColors position="top-center" {...props} />;
}
