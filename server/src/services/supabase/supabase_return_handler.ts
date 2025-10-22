import { writeSettings } from "@/services/settings";

export function handleSupabaseOAuthReturn({
  token,
  refreshToken,
  expiresIn,
}: {
  token: string;
  refreshToken: string;
  expiresIn: number;
}) {
  writeSettings({
    supabase: {
      accessToken: {
        value: token,
      },
      refreshToken: {
        value: refreshToken,
      },
      expiresIn,
      tokenTimestamp: Math.floor(Date.now() / 1000),
    },
  });
}
