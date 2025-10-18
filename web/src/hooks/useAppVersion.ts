import { useState, useEffect } from "react";
import api from "@/api";

export function useAppVersion() {
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await api.version.getAppVersion();
        setAppVersion(version);
      } catch {
        setAppVersion(null);
      }
    };
    fetchVersion();
  }, []);

  return appVersion;
}
