import logger from "@/logger";

import {
  getNeonClient,
  getNeonErrorMessage,
} from "@/services/neon_admin/neon_management_client";
import { retryOnLocked } from "./retryOnLocked";
import { updatePostgresUrlEnvVar, updateDbPushEnvVar } from "./app_env_var_utils";

export async function restoreBranchForPreview({
  appId,
  dbTimestamp,
  neonProjectId,
  previewBranchId,
  developmentBranchId,
}: {
  appId: number;
  dbTimestamp: string;
  neonProjectId: string;
  previewBranchId: string;
  developmentBranchId: string;
}): Promise<void> {
  try {
    const neonClient = await getNeonClient();
    await retryOnLocked(
      () =>
        neonClient.restoreProjectBranch(neonProjectId, previewBranchId, {
          source_branch_id: developmentBranchId,
          source_timestamp: dbTimestamp,
        }),
      `Restore preview branch ${previewBranchId} for app ${appId}`
    );
  } catch (error: any) {
    const errorMessage = getNeonErrorMessage(error);
    logger.error("Error in restoreBranchForPreview:", errorMessage);
    throw new Error(errorMessage);
  }
}

export async function switchPostgresToDevelopmentBranch({
  neonProjectId,
  neonDevelopmentBranchId,
  appPath,
}: {
  neonProjectId: string;
  neonDevelopmentBranchId: string;
  appPath: string;
}) {
  // SWITCH the env var for POSTGRES_URL to the development branch
  const neonClient = await getNeonClient();
  const connectionUri = await neonClient.getConnectionUri({
    projectId: neonProjectId,
    branch_id: neonDevelopmentBranchId,
    // This is the default database name for Neon
    database_name: "neondb",
    // This is the default role name for Neon
    role_name: "neondb_owner",
  });

  await updatePostgresUrlEnvVar({
    appPath,
    connectionUri: connectionUri.data.uri,
  });

  await updateDbPushEnvVar({
    appPath,
    disabled: false,
  });
}

// --------------------------------
// Local models helpers
// --------------------------------
export const LM_STUDIO_BASE_URL =
  process.env.LM_STUDIO_BASE_URL_FOR_TESTING || "http://localhost:1234";

export function parseOllamaHost(host?: string): string {
  if (!host) {
    return "http://localhost:11434";
  }

  // If it already has a protocol, use as-is
  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host;
  }

  // Check for bracketed IPv6 with port: [::1]:8080
  if (host.startsWith("[") && host.includes("]:")) {
    return `http://${host}`;
  }

  // Check for regular host:port (but not plain IPv6)
  if (host.includes(":") && !host.includes("::") && host.split(":").length === 2) {
    return `http://${host}`;
  }

  // Check if it's a plain IPv6 address (contains :: or multiple colons)
  if (host.includes("::") || host.split(":").length > 2) {
    return `http://[${host}]:11434`;
  }

  // If it's just a hostname, add default port
  return `http://${host}:11434`;
}

export function getOllamaApiUrl(): string {
  return parseOllamaHost(process.env.OLLAMA_HOST);
}
