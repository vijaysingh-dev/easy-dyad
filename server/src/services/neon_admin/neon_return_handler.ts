import { writeSettings } from "../../shared/settings";

export function handleNeonOAuthReturn({
  token,
  refreshToken,
  expiresIn,
}: {
  token: string;
  refreshToken: string;
  expiresIn: number;
}) {
  writeSettings({
    neon: {
      accessToken: {
        value: token,
        encryptionType: "aes-256-gcm",
      },
      refreshToken: {
        value: refreshToken,
        encryptionType: "aes-256-gcm",
      },
      expiresIn,
      tokenTimestamp: Math.floor(Date.now() / 1000),
    },
  });
}
