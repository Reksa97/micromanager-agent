"use client";

//import { ClickToComponent } from "click-to-react-component-dev";
import { ClickToComponent } from "click-to-react-component-nextjs-app-router";
import { ClickToComponent as UpstreamClickToComponent } from "click-to-react-component";

export function DevClickToComponent() {
  if (process.env.NODE_ENV !== "development") {
    return <UpstreamClickToComponent editor="cursor" />;
  }

  return <ClickToComponent editor="cursor" />;
}
