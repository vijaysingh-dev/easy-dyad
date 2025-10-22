import logger from "@/logger";
import fs from "node:fs";
import path from "node:path";
import crypto from "crypto";
import { getUserDataPath } from "./paths";
import { v4 as uuidv4 } from "uuid";
import { DEFAULT_TEMPLATE_ID } from "@/services/llm/templates";
import {
  UserSettingsSchema,
  type UserSettings,
  Secret,
  VertexProviderSetting,
} from "@shared/schemas";

// IF YOU NEED TO UPDATE THIS, YOU'RE PROBABLY DOING SOMETHING WRONG!
// Need to maintain backwards compatibility!
const DEFAULT_SETTINGS: UserSettings = {
  selectedModel: {
    name: "auto",
    provider: "auto",
  },
  providerSettings: {},
  telemetryConsent: "unset",
  telemetryUserId: uuidv4(),
  hasRunBefore: false,
  experiments: {},
  enableProLazyEditsMode: true,
  enableProSmartFilesContextMode: true,
  selectedChatMode: "build",
  enableAutoFixProblems: false,
  enableAutoUpdate: true,
  releaseChannel: "stable",
  selectedTemplateId: DEFAULT_TEMPLATE_ID,
};

const SETTINGS_FILE = "user-settings.json";

export function getSettingsFilePath(): string {
  return path.join(getUserDataPath(), SETTINGS_FILE);
}

export function readSettings(): UserSettings {
  try {
    const filePath = getSettingsFilePath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
      return DEFAULT_SETTINGS;
    }
    const rawSettings = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const combinedSettings: UserSettings = {
      ...DEFAULT_SETTINGS,
      ...rawSettings,
    };
    const supabase = combinedSettings.supabase;
    if (supabase) {
      if (supabase.refreshToken) {
        const encryptionType = supabase.refreshToken.encryptionType;
        if (encryptionType) {
          supabase.refreshToken = {
            value: decrypt(supabase.refreshToken),
            encryptionType,
          };
        }
      }
      if (supabase.accessToken) {
        const encryptionType = supabase.accessToken.encryptionType;
        if (encryptionType) {
          supabase.accessToken = {
            value: decrypt(supabase.accessToken),
            encryptionType,
          };
        }
      }
    }
    const neon = combinedSettings.neon;
    if (neon) {
      if (neon.refreshToken) {
        const encryptionType = neon.refreshToken.encryptionType;
        if (encryptionType) {
          neon.refreshToken = {
            value: decrypt(neon.refreshToken),
            encryptionType,
          };
        }
      }
      if (neon.accessToken) {
        const encryptionType = neon.accessToken.encryptionType;
        if (encryptionType) {
          neon.accessToken = {
            value: decrypt(neon.accessToken),
            encryptionType,
          };
        }
      }
    }
    if (combinedSettings.githubAccessToken) {
      const encryptionType = combinedSettings.githubAccessToken.encryptionType;
      combinedSettings.githubAccessToken = {
        value: decrypt(combinedSettings.githubAccessToken),
        encryptionType,
      };
    }
    if (combinedSettings.vercelAccessToken) {
      const encryptionType = combinedSettings.vercelAccessToken.encryptionType;
      combinedSettings.vercelAccessToken = {
        value: decrypt(combinedSettings.vercelAccessToken),
        encryptionType,
      };
    }
    for (const provider in combinedSettings.providerSettings) {
      if (combinedSettings.providerSettings[provider].apiKey) {
        const encryptionType =
          combinedSettings.providerSettings[provider].apiKey.encryptionType;
        combinedSettings.providerSettings[provider].apiKey = {
          value: decrypt(combinedSettings.providerSettings[provider].apiKey),
          encryptionType,
        };
      }
      // Decrypt Vertex service account key if present
      const v = combinedSettings.providerSettings[provider] as VertexProviderSetting;
      if (provider === "vertex" && v?.serviceAccountKey) {
        const encryptionType = v.serviceAccountKey.encryptionType;
        v.serviceAccountKey = {
          value: decrypt(v.serviceAccountKey),
          encryptionType,
        };
      }
    }

    // Validate and merge with defaults
    const validatedSettings = UserSettingsSchema.parse(combinedSettings);

    return validatedSettings;
  } catch (error) {
    logger.error("Error reading settings:", error);
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: Partial<UserSettings>): void {
  try {
    const filePath = getSettingsFilePath();
    const currentSettings = readSettings();
    const newSettings = { ...currentSettings, ...settings };
    if (newSettings.githubAccessToken) {
      newSettings.githubAccessToken = encrypt(newSettings.githubAccessToken.value);
    }
    if (newSettings.vercelAccessToken) {
      newSettings.vercelAccessToken = encrypt(newSettings.vercelAccessToken.value);
    }
    if (newSettings.supabase) {
      if (newSettings.supabase.accessToken) {
        newSettings.supabase.accessToken = encrypt(
          newSettings.supabase.accessToken.value
        );
      }
      if (newSettings.supabase.refreshToken) {
        newSettings.supabase.refreshToken = encrypt(
          newSettings.supabase.refreshToken.value
        );
      }
    }
    if (newSettings.neon) {
      if (newSettings.neon.accessToken) {
        newSettings.neon.accessToken = encrypt(newSettings.neon.accessToken.value);
      }
      if (newSettings.neon.refreshToken) {
        newSettings.neon.refreshToken = encrypt(newSettings.neon.refreshToken.value);
      }
    }
    for (const provider in newSettings.providerSettings) {
      if (newSettings.providerSettings[provider].apiKey) {
        newSettings.providerSettings[provider].apiKey = encrypt(
          newSettings.providerSettings[provider].apiKey.value
        );
      }
      // Encrypt Vertex service account key if present
      const v = newSettings.providerSettings[provider] as VertexProviderSetting;
      if (provider === "vertex" && v?.serviceAccountKey) {
        v.serviceAccountKey = encrypt(v.serviceAccountKey.value);
      }
    }
    const validatedSettings = UserSettingsSchema.parse(newSettings);
    fs.writeFileSync(filePath, JSON.stringify(validatedSettings, null, 2));
  } catch (error) {
    logger.error("Error writing settings:", error);
  }
}

const ALGORITHM = "aes-256-gcm";
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(process.env.SECRET_KEY || "default_dev_key")
  .digest();
const IV_LENGTH = 16;

// Encrypt data using AES-256-GCM
export function encrypt(data: string): Secret {
  if (IS_TEST_BUILD) {
    return { value: data, encryptionType: "plaintext" };
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    value: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    encryptionType: "aes-256-gcm",
  };
}

// Decrypt AES-256-GCM data
export function decrypt(data: Secret): string {
  if (data.encryptionType === "plaintext") return data.value;

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(data.iv!, "base64")
  );

  decipher.setAuthTag(Buffer.from(data.authTag!, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data.value, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
