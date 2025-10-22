import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

import { PostHogProvider } from "posthog-js/react";
import posthog from "posthog-js";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from "@tanstack/react-query";
import { showError } from "@/components/Toast";
import { getTelemetryUserId, isTelemetryOptedIn } from "./hooks/useSettings";

// @ts-ignore
console.log("Running in mode:", import.meta.env.MODE);

interface MyMeta extends Record<string, unknown> {
  showErrorToast: boolean;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: MyMeta;
    mutationMeta: MyMeta;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.showErrorToast) {
        showError(error);
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.showErrorToast) {
        showError(error);
      }
    },
  }),
});

const posthogClient = posthog.init("phc_5Vxx0XT8Ug3eWROhP6mm4D6D2DgIIKT232q4AKxC2ab", {
  api_host: "https://us.i.posthog.com",
  // @ts-ignore
  debug: import.meta.env.MODE === "development",
  autocapture: false,
  capture_exceptions: true,
  capture_pageview: false,
  before_send: (event) => {
    if (!isTelemetryOptedIn()) {
      console.debug("Telemetry not opted in, skipping event");
      return null;
    }
    const telemetryUserId = getTelemetryUserId();
    if (telemetryUserId) {
      posthogClient.identify(telemetryUserId);
    }

    if (event?.properties["$ip"]) {
      event.properties["$ip"] = null;
    }

    console.debug("Telemetry opted in - UUID:", telemetryUserId, "sending event", event);
    return event;
  },
  persistence: "localStorage",
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PostHogProvider client={posthogClient}>
        <App />
      </PostHogProvider>
    </QueryClientProvider>
  </StrictMode>
);
