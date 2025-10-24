import React, { createContext, useContext, useEffect, useState } from "react";
import { DeepLinkData } from "@shared/eeziTypes";
import api from "@/api";

type DeepLinkContextType = {
  lastDeepLink: (DeepLinkData & { timestamp: number }) | null;
};

const DeepLinkContext = createContext<DeepLinkContextType>({
  lastDeepLink: null,
});

export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const [lastDeepLink, setLastDeepLink] = useState<
    (DeepLinkData & { timestamp: number }) | null
  >(null);

  useEffect(() => {
    const unsubscribe = api.integration.onDeepLinkReceived((data) => {
      // Update with timestamp to ensure state change even if same type comes twice
      console.log("Deep link received:", data);
      setLastDeepLink({ ...data, timestamp: Date.now() });
    });

    return unsubscribe;
  }, []);

  return (
    <DeepLinkContext.Provider value={{ lastDeepLink }}>
      {children}
    </DeepLinkContext.Provider>
  );
}

export const useDeepLink = () => useContext(DeepLinkContext);
