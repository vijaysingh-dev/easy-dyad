import dotenv from "dotenv";
dotenv.config();

export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT || 8000);
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "*";

export const IS_TEST_BUILD = process.env.E2E_TEST_BUILD === "true";
