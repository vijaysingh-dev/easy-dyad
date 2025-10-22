import logger from "@/logger";
import db from "@/db";
import { mcpServers, mcpToolConsents } from "@/db/schema";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { getStoredConsent, resolveConsent } from "@/utils/mcp_consent";
import { mcpManager } from "@/utils/mcp_manager";

const router = Router();

type ConsentDecision = "accept-once" | "accept-always" | "decline";

// CRUD for MCP servers
router.get("/list-servers", async (req, res) => {
  try {
    const result = await db.select().from(mcpServers);
    res.json(result);
  } catch (error) {
    logger.error("Error listing mcp servers:", error);
    res.status(500).json({ error: "Failed to list mcp servers" });
  }
});

router.post("/create-server", async (req, res) => {
  try {
    const { name, transport, command, args, envJson, url, enabled } = req.body;
    const result = await db
      .insert(mcpServers)
      .values({
        name,
        transport,
        command: command || null,
        args: args || null,
        envJson: envJson || null,
        url: url || null,
        enabled: !!enabled,
      })
      .returning();
    res.json(result[0]);
  } catch (error) {
    logger.error("Error creating mcp server:", error);
    res.status(500).json({ error: "Failed to create mcp server" });
  }
});

router.patch("/update-server", async (req, res) => {
  try {
    const { id, name, transport, command, args, cwd, envJson, url, enabled } = req.body;
    const update: any = {};
    if (name !== undefined) update.name = name;
    if (transport !== undefined) update.transport = transport;
    if (command !== undefined) update.command = command;
    if (args !== undefined) update.args = args || null;
    if (cwd !== undefined) update.cwd = cwd;
    if (envJson !== undefined) update.envJson = envJson || null;
    if (url !== undefined) update.url = url;
    if (enabled !== undefined) update.enabled = !!enabled;

    const result = await db
      .update(mcpServers)
      .set(update)
      .where(eq(mcpServers.id, id))
      .returning();
    // If server config changed, dispose cached client to be recreated on next use
    try {
      mcpManager.dispose(id);
    } catch {
      logger.warn(`No existing MCP client to dispose for server ID ${id}`);
    }
    res.json(result[0]);
  } catch (error) {
    logger.error("Error updating mcp server:", error);
    res.status(500).json({ error: "Failed to update mcp server" });
  }
});

router.delete("/delete-server/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    try {
      mcpManager.dispose(id);
    } catch {
      logger.warn(`No existing MCP client to dispose for server ID ${id}`);
    }
    await db.delete(mcpServers).where(eq(mcpServers.id, id));
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting mcp server:", error);
    res.status(500).json({ error: "Failed to delete mcp server" });
  }
});

// Tools listing (dynamic)
router.get("/list-tools/:serverId", async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const client = await mcpManager.getClient(serverId);
    const remoteTools = await client.tools();
    const tools = await Promise.all(
      Object.entries(remoteTools).map(async ([name, tool]) => ({
        name,
        description: tool.description ?? null,
        consent: await getStoredConsent(serverId, name),
      }))
    );
    res.json(tools);
  } catch (error) {
    logger.error("Failed to list tools", error);
    res.status(500).json({ error: "Failed to list tools" });
  }
});
// Consents
router.get("/get-tool-consents", async (req, res) => {
  try {
    const result = await db.select().from(mcpToolConsents);
    res.json(result);
  } catch (error) {
    logger.error("Error fetching tool consents:", error);
    res.status(500).json({ error: "Failed to fetch tool consents" });
  }
});

router.post("/set-tool-consent", async (req, res) => {
  try {
    const { serverId, toolName, consent } = req.body;
    const existing = await db
      .select()
      .from(mcpToolConsents)
      .where(
        and(
          eq(mcpToolConsents.serverId, serverId),
          eq(mcpToolConsents.toolName, toolName)
        )
      );
    if (existing.length > 0) {
      const result = await db
        .update(mcpToolConsents)
        .set({ consent: consent })
        .where(
          and(
            eq(mcpToolConsents.serverId, serverId),
            eq(mcpToolConsents.toolName, toolName)
          )
        )
        .returning();
      res.json(result[0]);
    } else {
      const result = await db
        .insert(mcpToolConsents)
        .values({
          serverId: serverId,
          toolName: toolName,
          consent: consent,
        })
        .returning();
      res.json(result[0]);
    }
  } catch (error) {
    logger.info("Error setting tool consent:", error);
    res.status(500).json({ error: "Failed to set tool consent" });
  }
});

// Tool consent request/response handshake
// Receive consent response from renderer
router.post("/tool-consent-response", async (req, res) => {
  const { requestId, decision } = req.body;
  resolveConsent(requestId, decision);
});

export default router;
