import log from "@/logger";
import db from "@/db";
import { apps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { readSettings, writeSettings } from "@/services/settings";
import { IS_TEST_BUILD } from "./test_utils";
import { GithubUser } from "@shared/schemas";

const logger = log.scope("integration-utils");

// Use test server URLs when in test mode
const TEST_SERVER_BASE = "http://localhost:3500";
const VERCEL_API_BASE = IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/vercel/api`
  : "https://api.vercel.com";

// --- GitHub Integration Helpers

// TODO: Fetch this securely, e.g., from environment variables or a config file
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "Ov23liWV2HdC0RBLecWx";

// Use test server URLs when in test mode
const GITHUB_ACCESS_TOKEN_URL = IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/login/oauth/access_token`
  : "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE = IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/github/api`
  : "https://api.github.com";

export async function updateAppGithubRepo({
  appId,
  org,
  repo,
  branch,
}: {
  appId: number;
  org?: string;
  repo: string;
  branch?: string;
}): Promise<void> {
  await db
    .update(apps)
    .set({
      githubOrg: org,
      githubRepo: repo,
      githubBranch: branch || "main",
    })
    .where(eq(apps.id, appId));
}

/**
 * Fetches the GitHub username of the currently authenticated user (using the stored access token).
 * @returns {Promise<string|null>} The GitHub username, or null if not authenticated or on error.
 */
export async function getGithubUser(): Promise<GithubUser | null> {
  const settings = readSettings();
  const email = settings.githubUser?.email;
  if (email) return { email };
  try {
    const accessToken = settings.githubAccessToken?.value;
    if (!accessToken) return null;
    const res = await fetch(`${GITHUB_API_BASE}/user/emails`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const emails = await res.json();
    const email = emails.find((e: any) => e.primary)?.email;
    if (!email) return null;

    writeSettings({
      githubUser: {
        email,
      },
    });
    return { email };
  } catch (err) {
    logger.error("[GitHub Handler] Failed to get GitHub username:", err);
    return null;
  }
}

// --- GitHub Integration Helpers
