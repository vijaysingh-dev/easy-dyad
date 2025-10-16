import { Router } from "express";
import logger from "../logger";
import { type UserSettings, type NodeSystemInfo } from "../ipc/ipc_types";
import { readSettings, writeSettings } from "../../../shared/settings";
import { db } from "../db";
import { apps } from "../db/schema";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { getLanguageModelProviders } from "../shared/language_model_helpers";
import { getEnvVar } from "../utils/read_env";
import { execSync } from "child_process";
import { platform, arch } from "os";
import fixPath from "fix-path";
import { runShellCommand } from "@/utils/runShellCommand";

const router = Router();

export default router;
