import log from "@/logger";
import { Router } from "express";
import * as fs from "fs";
import path from "path";
import { IS_TEST_BUILD } from "@/utils/test_utils";

const logger = log.scope("version");
const router = Router();

router.get("/get-app-version", async (req, res) => {
  // Read version from package.json at project root
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  res.json({ version: packageJson.version });
});

router.get("/does-release-note-exist", async (req, res) => {
  // For E2E tests, we don't want to check for release notes
  // or show release notes, as it interferes with the tests.
  if (IS_TEST_BUILD) {
    res.json({ exists: false });
    return;
  }

  const { version } = req.query;
  if (!version || typeof version !== "string") {
    res.status(400).json({ error: "Invalid or missing version parameter" });
    return;
  }
  const releaseNoteUrl = `https://www.dyad.sh/docs/releases/${version}`;
  try {
    logger.debug(`Checking for release note at: ${releaseNoteUrl}`);
    const response = await fetch(releaseNoteUrl, { method: "HEAD" }); // Use HEAD to check existence without downloading content
    if (response.ok) {
      logger.debug(`Release note found for version ${version} at ${releaseNoteUrl}`);
      res.json({ exists: true, url: releaseNoteUrl });
    } else if (response.status === 404) {
      logger.debug(`Release note not found for version ${version} at ${releaseNoteUrl}`);
      res.json({ exists: false });
    } else {
      // Log other non-404 errors but still treat as "not found" for the client,
      // as the primary goal is to check existence.
      logger.warn(
        `Unexpected status code ${response.status} when checking for release note: ${releaseNoteUrl}`
      );
      res.json({ exists: false });
    }
  } catch (error) {
    logger.error(
      `Error fetching release note for version ${version} at ${releaseNoteUrl}:`,
      error
    );
    // In case of network errors, etc., assume it doesn't exist or is inaccessible.
    // Throwing an error here would propagate to the client and might be too disruptive
    // if the check is just for UI purposes (e.g., showing a link).
    // Consider if specific errors should be thrown based on requirements.
    res.status(404).json({ exists: false });
  }
  logger.debug("Registered release note IPC handlers");
});

export default router;
