import { Router } from 'express';
import logger from '../logger';
import { type CreateMcpServer, type McpServerUpdate, type McpToolConsentType } from '../ipc/ipc_types';
import { db } from '../db';
import { mcpServers, mcpToolConsents } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// List MCP servers
router.get('/servers', async (_req, res) => {
  try {
    const servers = await db.query.mcpServers.findMany({
      orderBy: (servers, { desc }) => [desc(servers.updatedAt)]
    });
    res.json(servers);
  } catch (error) {
    logger.error('Error listing MCP servers:', error);
    res.status(500).json({ error: 'Failed to list MCP servers' });
  }
});

// Create MCP server
router.post('/servers', async (req, res) => {
  try {
    const params: CreateMcpServer = req.body;

    // Validate required fields
    if (!params.name || !params.transport) {
      return res.status(400).json({ error: 'Name and transport are required' });
    }

    // Create server
    const [server] = await db.insert(mcpServers)
      .values({
        name: params.name,
        transport: params.transport,
        command: params.command,
        args: params.args,
        envJson: params.envJson,
        url: params.url,
        enabled: params.enabled
      })
      .returning();

    res.json(server);
  } catch (error) {
    logger.error('Error creating MCP server:', error);
    res.status(500).json({ error: 'Failed to create MCP server' });
  }
});

// Update MCP server
router.put('/servers/:id', async (req, res) => {
  try {
    const params: McpServerUpdate = {
      ...req.body,
      id: parseInt(req.params.id)
    };

    if (isNaN(params.id)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    // Check if server exists
    const existingServer = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, params.id)
    });

    if (!existingServer) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Update server
    const [updatedServer] = await db.update(mcpServers)
      .set({
        name: params.name,
        transport: params.transport,
        command: params.command,
        args: params.args,
        envJson: params.envJson,
        url: params.url,
        enabled: params.enabled,
        updatedAt: new Date()
      })
      .where(eq(mcpServers.id, params.id))
      .returning();

    res.json(updatedServer);
  } catch (error) {
    logger.error('Error updating MCP server:', error);
    res.status(500).json({ error: 'Failed to update MCP server' });
  }
});

// Delete MCP server
router.delete('/servers/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    // Check if server exists
    const existingServer = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, id)
    });

    if (!existingServer) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Delete server (tool consents will be cascade deleted)
    await db.delete(mcpServers).where(eq(mcpServers.id, id));

    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting MCP server:', error);
    res.status(500).json({ error: 'Failed to delete MCP server' });
  }
});

// List MCP tools
router.get('/servers/:id/tools', async (req, res) => {
  try {
    const serverId = parseInt(req.params.id);
    if (isNaN(serverId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    // Check if server exists
    const server = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, serverId)
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Get tool consents for this server
    const consents = await db.query.mcpToolConsents.findMany({
      where: eq(mcpToolConsents.serverId, serverId)
    });

    // For now, we'll return the list of tools with their consent status
    res.json(consents.map(consent => ({
      name: consent.toolName,
      consent: consent.consent
    })));
  } catch (error) {
    logger.error('Error listing MCP tools:', error);
    res.status(500).json({ error: 'Failed to list MCP tools' });
  }
});

// Get tool consents
router.get('/tool-consents', async (_req, res) => {
  try {
    const consents = await db.select({
      id: mcpToolConsents.id,
      serverId: mcpToolConsents.serverId,
      serverName: mcpServers.name,
      toolName: mcpToolConsents.toolName,
      consent: mcpToolConsents.consent
    })
    .from(mcpToolConsents)
    .innerJoin(mcpServers, eq(mcpToolConsents.serverId, mcpServers.id));

    res.json(consents);
  } catch (error) {
    logger.error('Error getting MCP tool consents:', error);
    res.status(500).json({ error: 'Failed to get MCP tool consents' });
  }
});

// Set tool consent
router.post('/tool-consents', async (req, res) => {
  try {
    const { serverId, toolName, consent } = req.body;
    const numericServerId = parseInt(serverId);

    if (isNaN(numericServerId)) {
      return res.status(400).json({ error: 'Invalid server ID' });
    }

    if (!toolName) {
      return res.status(400).json({ error: 'Tool name is required' });
    }

    if (!['ask', 'always', 'denied'].includes(consent)) {
      return res.status(400).json({ error: 'Invalid consent value' });
    }

    // Check if server exists
    const server = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, numericServerId)
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Upsert consent
    const [toolConsent] = await db
      .insert(mcpToolConsents)
      .values({
        serverId: numericServerId,
        toolName,
        consent: consent as McpToolConsentType
      })
      .onConflictDoUpdate({
        target: [mcpToolConsents.serverId, mcpToolConsents.toolName],
        set: { consent: consent as McpToolConsentType }
      })
      .returning();

    res.json(toolConsent);
  } catch (error) {
    logger.error('Error setting MCP tool consent:', error);
    res.status(500).json({ error: 'Failed to set MCP tool consent' });
  }
});

// Respond to tool consent request
router.post('/tool-consents/:requestId/respond', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { decision } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'Request ID is required' });
    }

    if (typeof decision !== 'boolean') {
      return res.status(400).json({ error: 'Decision must be a boolean' });
    }

    // For now, we'll store the decision as an 'always' or 'denied' consent
    // This could be expanded to handle temporary approvals in the future
    const consent: McpToolConsentType = decision ? 'always' : 'denied';

    // The requestId format should be {serverId}-{toolName}
    const [serverIdStr, toolName] = requestId.split('-');
    const serverId = parseInt(serverIdStr);

    if (isNaN(serverId) || !toolName) {
      return res.status(400).json({ error: 'Invalid request ID format' });
    }

    // Check if server exists
    const server = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.id, serverId)
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Upsert consent
    const [toolConsent] = await db
      .insert(mcpToolConsents)
      .values({
        serverId,
        toolName,
        consent
      })
      .onConflictDoUpdate({
        target: [mcpToolConsents.serverId, mcpToolConsents.toolName],
        set: { consent }
      })
      .returning();

    res.json(toolConsent);
  } catch (error) {
    logger.error('Error responding to MCP consent request:', error);
    res.status(500).json({ error: 'Failed to respond to MCP consent request' });
  }
});

export default router;