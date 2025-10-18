import db from "@/db";
import log from "@/logger";
import { Router } from "express";
import { IS_TEST_BUILD } from "../ipc/utils/test_utils";
import {
  type SaveVercelAccessTokenParams,
  type ConnectToExistingVercelProjectParams,
  type CreateVercelProjectParams,
  type GetVercelDeploymentsParams,
  type DisconnectVercelProjectParams,
  type IsVercelProjectAvailableParams,
  type CreateNeonProjectParams,
  type GetNeonProjectParams,
  type GetNeonProjectResponse,
  type NeonBranch,
} from "@shared/eeziTypes";
import { readSettings, writeSettings } from "../services/settings";
import { apps } from "../db/schema";
import { eq } from "drizzle-orm";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import { getSupabaseClient } from "../ipc/utils/supabase_client";
import {
  getNeonClient,
  getNeonErrorMessage,
  getNeonOrganizationId,
} from "@/services/neon_admin/neon_management_client";
import { handleNeonOAuthReturn } from "@/services/neon_admin/neon_return_handler";
import { retryOnLocked } from "../ipc/utils/retryOnLocked";

// Use test server URLs when in test mode
const TEST_SERVER_BASE = "http://localhost:3500";
const VERCEL_API_BASE = IS_TEST_BUILD
  ? `${TEST_SERVER_BASE}/vercel/api`
  : "https://api.vercel.com";

const logger = log.scope("integration-route");
const router = Router();

router.get("/neon/fake-connect", async (req, res) => {
  try {
    // Call handleNeonOAuthReturn with fake data
    handleNeonOAuthReturn({
      token: "fake-neon-access-token",
      refreshToken: "fake-neon-refresh-token",
      expiresIn: 3600, // 1 hour
    });
    logger.info("Called handleNeonOAuthReturn with fake data during testing.");

    // Simulate the deep link event
    res.json({
      type: "neon-oauth-return",
      url: "https://oauth.dyad.sh/api/integrations/neon/login",
    });
    logger.info("Sent fake neon deep-link-received event during testing.");
  } catch (error) {
    logger.error("Error disconnecting Neon project:", error);
    res.status(500).json({ error: "Failed to disconnect Neon project" });
  }
});

export default router;
