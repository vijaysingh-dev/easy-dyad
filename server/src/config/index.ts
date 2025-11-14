import dotenv from "dotenv";
dotenv.config();

import logger from "@/logger";

export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_TEST_BUILD = NODE_ENV !== "production";

export const PORT = Number(process.env.PORT || 8000);

export const PUBLIC_IP = process.env.PUBLIC_IP || "localhost";
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "*";

// Log all configuration on startup
logger.info(`Configuration:
  NODE_ENV: ${NODE_ENV}
  PORT: ${PORT}
  PUBLIC_IP: ${PUBLIC_IP}
  ALLOWED_ORIGINS: ${ALLOWED_ORIGINS}
  IS_TEST_BUILD: ${IS_TEST_BUILD}
`);
