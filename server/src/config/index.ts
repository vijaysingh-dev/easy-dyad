import dotenv from "dotenv";
dotenv.config();

export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_TEST_BUILD = NODE_ENV !== "production";

export const PORT = Number(process.env.PORT || 8000);

export const PUBLIC_IP = process.env.PUBLIC_IP || "localhost";
