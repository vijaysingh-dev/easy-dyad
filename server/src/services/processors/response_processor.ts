import logger from "@/logger";
import db from "@/db";
import { chats, messages } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import fs from "node:fs";
import { getEeziAppPath } from "@/shared/paths";
import path from "node:path";
import git from "isomorphic-git";
import { safeJoin } from "@/utils/path_utils";

import { executeAddDependency } from "./executeAddDependency";
import {
  deleteSupabaseFunction,
  deploySupabaseFunctions,
  executeSupabaseSql,
} from "@/services/supabase/supabase_management_client";
import { isServerFunction } from "@/services/supabase/supabase_utils";
import { readSettings } from "@/shared/settings";
import { UserSettings } from "@/shared/schemas";
import { gitCommit } from "@/utils/git_utils";
import { writeMigrationFile } from "@/utils/file_utils";
import {
  getEeziWriteTags,
  getEeziRenameTags,
  getEeziDeleteTags,
  getEeziAddDependencyTags,
  getEeziExecuteSqlTags,
} from "@/utils/eezi_tag_parser";
import { storeDbTimestampAtCurrentVersion } from "@/utils/neon_timestamp_utils";

import { FileUploadsState } from "@/utils/file_uploads_state";

const readFile = fs.promises.readFile;

interface Output {
  message: string;
  error: unknown;
}

function getFunctionNameFromPath(input: string): string {
  return path.basename(path.extname(input) ? path.dirname(input) : input);
}

async function readFileFromFunctionPath(input: string): Promise<string> {
  // Sometimes, the path given is a directory, sometimes it's the file itself.
  if (path.extname(input) === "") {
    return readFile(path.join(input, "index.ts"), "utf8");
  }
  return readFile(input, "utf8");
}

export async function processFullResponseActions(
  fullResponse: string,
  chatId: number,
  {
    chatSummary,
    messageId,
  }: {
    chatSummary: string | undefined;
    messageId: number;
  }
): Promise<{
  updatedFiles?: boolean;
  error?: string;
  extraFiles?: string[];
  extraFilesError?: string;
}> {
  const fileUploadsState = FileUploadsState.getInstance();
  const fileUploadsMap = fileUploadsState.getFileUploadsForChat(chatId);
  fileUploadsState.clear(chatId);
  logger.log("processFullResponseActions for chatId", chatId);
  // Get the app associated with the chat
  const chatWithApp = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    with: {
      app: true,
    },
  });
  if (!chatWithApp || !chatWithApp.app) {
    logger.error(`No app found for chat ID: ${chatId}`);
    return {};
  }

  if (chatWithApp.app.neonProjectId && chatWithApp.app.neonDevelopmentBranchId) {
    try {
      await storeDbTimestampAtCurrentVersion({
        appId: chatWithApp.app.id,
      });
    } catch (error: any) {
      logger.error("Error creating Neon branch at current version:", error.message);
      throw new Error(
        "Could not create Neon branch; database versioning functionality is not working: " +
          error
      );
    }
  }

  const settings: UserSettings = readSettings();
  const appPath = getEeziAppPath(chatWithApp.app.path);
  const writtenFiles: string[] = [];
  const renamedFiles: string[] = [];
  const deletedFiles: string[] = [];
  let hasChanges = false;

  const warnings: Output[] = [];
  const errors: Output[] = [];

  try {
    // Extract all tags
    const eeziWriteTags = getEeziWriteTags(fullResponse);
    const eeziRenameTags = getEeziRenameTags(fullResponse);
    const eeziDeletePaths = getEeziDeleteTags(fullResponse);
    const eeziAddDependencyPackages = getEeziAddDependencyTags(fullResponse);
    const eeziExecuteSqlQueries = chatWithApp.app.supabaseProjectId
      ? getEeziExecuteSqlTags(fullResponse)
      : [];

    const message = await db.query.messages.findFirst({
      where: and(
        eq(messages.id, messageId),
        eq(messages.role, "assistant"),
        eq(messages.chatId, chatId)
      ),
    });

    if (!message) {
      logger.error(`No message found for ID: ${messageId}`);
      return {};
    }

    // Handle SQL execution tags
    if (eeziExecuteSqlQueries.length > 0) {
      for (const query of eeziExecuteSqlQueries) {
        try {
          await executeSupabaseSql({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            query: query.content,
          });

          // Only write migration file if SQL execution succeeded
          if (settings.enableSupabaseWriteSqlMigration) {
            try {
              const migrationFilePath = await writeMigrationFile(
                appPath,
                query.content,
                query.description
              );
              writtenFiles.push(migrationFilePath);
            } catch (error: any) {
              errors.push({
                message: `Failed to write SQL migration file for: ${query.description}`,
                error: error,
              });
            }
          }
        } catch (error: any) {
          errors.push({
            message: `Failed to execute SQL query: ${query.content}`,
            error: error,
          });
        }
      }
      logger.log(`Executed ${eeziExecuteSqlQueries.length} SQL queries`);
    }

    // TODO: Handle add dependency tags
    if (eeziAddDependencyPackages.length > 0) {
      try {
        await executeAddDependency({
          packages: eeziAddDependencyPackages,
          message: message,
          appPath,
        });
      } catch (error: any) {
        errors.push({
          message: `Failed to add dependencies: ${eeziAddDependencyPackages.join(", ")}`,
          error: error,
        });
      }
      writtenFiles.push("package.json");
      const pnpmFilename = "pnpm-lock.yaml";
      if (fs.existsSync(safeJoin(appPath, pnpmFilename))) {
        writtenFiles.push(pnpmFilename);
      }
      const packageLockFilename = "package-lock.json";
      if (fs.existsSync(safeJoin(appPath, packageLockFilename))) {
        writtenFiles.push(packageLockFilename);
      }
    }

    //////////////////////
    // File operations //
    // Do it in this order:
    // 1. Deletes
    // 2. Renames
    // 3. Writes
    //
    // Why?
    // - Deleting first avoids path conflicts before the other operations.
    // - LLMs like to rename and then edit the same file.
    //////////////////////

    // Process all file deletions
    for (const filePath of eeziDeletePaths) {
      const fullFilePath = safeJoin(appPath, filePath);

      // Delete the file if it exists
      if (fs.existsSync(fullFilePath)) {
        if (fs.lstatSync(fullFilePath).isDirectory()) {
          fs.rmdirSync(fullFilePath, { recursive: true });
        } else {
          fs.unlinkSync(fullFilePath);
        }
        logger.log(`Successfully deleted file: ${fullFilePath}`);
        deletedFiles.push(filePath);

        // Remove the file from git
        try {
          await git.remove({
            fs,
            dir: appPath,
            filepath: filePath,
          });
        } catch (error: any) {
          logger.warn(`Failed to git remove deleted file ${filePath}:`, error);
          // Continue even if remove fails as the file was still deleted
        }
      } else {
        logger.warn(`File to delete does not exist: ${fullFilePath}`);
      }
      if (isServerFunction(filePath)) {
        try {
          await deleteSupabaseFunction({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            functionName: getFunctionNameFromPath(filePath),
          });
        } catch (error: any) {
          errors.push({
            message: `Failed to delete Supabase function: ${filePath}`,
            error: error,
          });
        }
      }
    }

    // Process all file renames
    for (const tag of eeziRenameTags) {
      const fromPath = safeJoin(appPath, tag.from);
      const toPath = safeJoin(appPath, tag.to);

      // Ensure target directory exists
      const dirPath = path.dirname(toPath);
      fs.mkdirSync(dirPath, { recursive: true });

      // Rename the file
      if (fs.existsSync(fromPath)) {
        fs.renameSync(fromPath, toPath);
        logger.log(`Successfully renamed file: ${fromPath} -> ${toPath}`);
        renamedFiles.push(tag.to);

        // Add the new file and remove the old one from git
        await git.add({
          fs,
          dir: appPath,
          filepath: tag.to,
        });
        try {
          await git.remove({
            fs,
            dir: appPath,
            filepath: tag.from,
          });
        } catch (error: any) {
          logger.warn(`Failed to git remove old file ${tag.from}:`, error);
          // Continue even if remove fails as the file was still renamed
        }
      } else {
        logger.warn(`Source file for rename does not exist: ${fromPath}`);
      }
      if (isServerFunction(tag.from)) {
        try {
          await deleteSupabaseFunction({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            functionName: getFunctionNameFromPath(tag.from),
          });
        } catch (error: any) {
          warnings.push({
            message: `Failed to delete Supabase function: ${tag.from} as part of renaming ${tag.from} to ${tag.to}`,
            error: error,
          });
        }
      }
      if (isServerFunction(tag.to)) {
        try {
          await deploySupabaseFunctions({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            functionName: getFunctionNameFromPath(tag.to),
            content: await readFileFromFunctionPath(toPath),
          });
        } catch (error: any) {
          errors.push({
            message: `Failed to deploy Supabase function: ${tag.to} as part of renaming ${tag.from} to ${tag.to}`,
            error: error,
          });
        }
      }
    }

    // Process all file writes
    for (const tag of eeziWriteTags) {
      const filePath = tag.path;
      let content: string | Buffer = tag.content;
      const fullFilePath = safeJoin(appPath, filePath);

      // Check if content (stripped of whitespace) exactly matches a file ID and replace with actual file content
      if (fileUploadsMap) {
        const trimmedContent = tag.content.trim();
        const fileInfo = fileUploadsMap.get(trimmedContent);
        if (fileInfo) {
          try {
            const fileContent = await readFile(fileInfo.filePath);
            content = fileContent;
            logger.log(
              `Replaced file ID ${trimmedContent} with content from ${fileInfo.originalName}`
            );
          } catch (error: any) {
            logger.error(
              `Failed to read uploaded file ${fileInfo.originalName}:`,
              error
            );
            errors.push({
              message: `Failed to read uploaded file: ${fileInfo.originalName}`,
              error: error,
            });
          }
        }
      }

      // Ensure directory exists
      const dirPath = path.dirname(fullFilePath);
      fs.mkdirSync(dirPath, { recursive: true });

      // Write file content
      fs.writeFileSync(fullFilePath, content);
      logger.log(`Successfully wrote file: ${fullFilePath}`);
      writtenFiles.push(filePath);
      if (isServerFunction(filePath) && typeof content === "string") {
        try {
          await deploySupabaseFunctions({
            supabaseProjectId: chatWithApp.app.supabaseProjectId!,
            functionName: path.basename(path.dirname(filePath)),
            content: content,
          });
        } catch (error: any) {
          errors.push({
            message: `Failed to deploy Supabase function: ${filePath}`,
            error: error,
          });
        }
      }
    }

    // If we have any file changes, commit them all at once
    hasChanges =
      writtenFiles.length > 0 ||
      renamedFiles.length > 0 ||
      deletedFiles.length > 0 ||
      eeziAddDependencyPackages.length > 0;

    let uncommittedFiles: string[] = [];
    let extraFilesError: string | undefined;

    if (hasChanges) {
      // Stage all written files
      for (const file of writtenFiles) {
        await git.add({
          fs,
          dir: appPath,
          filepath: file,
        });
      }

      // Create commit with details of all changes
      const changes = [];
      if (writtenFiles.length > 0) changes.push(`wrote ${writtenFiles.length} file(s)`);
      if (renamedFiles.length > 0)
        changes.push(`renamed ${renamedFiles.length} file(s)`);
      if (deletedFiles.length > 0)
        changes.push(`deleted ${deletedFiles.length} file(s)`);
      if (eeziAddDependencyPackages.length > 0)
        changes.push(`added ${eeziAddDependencyPackages.join(", ")} package(s)`);
      if (eeziExecuteSqlQueries.length > 0)
        changes.push(`executed ${eeziExecuteSqlQueries.length} SQL queries`);

      let message = chatSummary
        ? `[eezi] ${chatSummary} - ${changes.join(", ")}`
        : `[eezi] ${changes.join(", ")}`;
      // Use chat summary, if provided, or default for commit message
      let commitHash = await gitCommit({
        path: appPath,
        message,
      });
      logger.log(`Successfully committed changes: ${changes.join(", ")}`);

      // Check for any uncommitted changes after the commit
      const statusMatrix = await git.statusMatrix({ fs, dir: appPath });
      uncommittedFiles = statusMatrix
        .filter((row) => row[1] !== 1 || row[2] !== 1 || row[3] !== 1)
        .map((row) => row[0]); // Get just the file paths

      if (uncommittedFiles.length > 0) {
        // Stage all changes
        await git.add({
          fs,
          dir: appPath,
          filepath: ".",
        });
        try {
          commitHash = await gitCommit({
            path: appPath,
            message: message + " + extra files edited outside of Eezi",
            amend: true,
          });
          logger.log(
            `Amend commit with changes outside of eezi: ${uncommittedFiles.join(", ")}`
          );
        } catch (error: any) {
          // Just log, but don't throw an error because the user can still
          // commit these changes outside of Eezi if needed.
          logger.error(
            `Failed to commit changes outside of eezi: ${uncommittedFiles.join(", ")}`
          );
          extraFilesError = (error as any).toString();
        }
      }

      // Save the commit hash to the message
      await db
        .update(messages)
        .set({
          commitHash: commitHash,
        })
        .where(eq(messages.id, messageId));
    }
    logger.log("mark as approved: hasChanges", hasChanges);
    // Update the message to approved
    await db
      .update(messages)
      .set({
        approvalState: "approved",
      })
      .where(eq(messages.id, messageId));

    return {
      updatedFiles: hasChanges,
      extraFiles: uncommittedFiles.length > 0 ? uncommittedFiles : undefined,
      extraFilesError,
    };
  } catch (error: any) {
    logger.error("Error processing files:", error.message);
    return { error: (error as any).toString() };
  } finally {
    const appendedContent = `
    ${warnings
      .map(
        (warning) =>
          `<eezi-output type="warning" message="${warning.message}">${warning.error}</eezi-output>`
      )
      .join("\n")}
    ${errors
      .map(
        (error) =>
          `<eezi-output type="error" message="${error.message}">${error.error}</eezi-output>`
      )
      .join("\n")}
    `;
    if (appendedContent.length > 0) {
      await db
        .update(messages)
        .set({
          content: fullResponse + "\n\n" + appendedContent,
        })
        .where(eq(messages.id, messageId));
    }
  }
}
