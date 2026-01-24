import dotenv from "dotenv";
dotenv.config();

const NODE_ENV =
  (process.env.NODE_ENV as "local" | "dev" | "qa" | "uat" | "prod" | "dr") || "local";
const IS_TEST_BUILD = NODE_ENV === "local";

const baseSettings = {
  NODE_ENV: NODE_ENV,
  IS_TEST_BUILD: IS_TEST_BUILD,
  PORT: Number(process.env.PORT || 8000),

  BASE_URL: `${NODE_ENV}.eezi.ai`,
  DOCKER_APP_IMAGE: "eezi/node-runtime:22",
  DOCKER_PROXY_IMAGE: "eezi/eezi-proxy:latest",

  APP_PORT: 3000,
  PROXY_PORT: 8080,
  APP_HOST: "0.0.0.0",
  HMR_PROTOCOL: IS_TEST_BUILD ? "ws" : "wss",
  HMR_HOST: IS_TEST_BUILD ? "localhost" : "app.eezi.dev",
};

const dbSettings = {
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: Number(process.env.DB_PORT || 5432),
  DB_USER: process.env.DB_USER || "postgres",
  DB_PASSWORD: process.env.DB_PASSWORD || "postgres",
  DB_NAME: process.env.DB_NAME || "eezi",
};

const awsSettings = {
  AWS_REGION: process.env.AWS_REGION || "eu-north-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",

  S3_BUCKET_NAME: `${NODE_ENV}-eezi-bucket`,

  ECS_SUBNETS: [],
  ECS_SECURITY_GROUPS: [],
  ECS_LOG_GROUP: `/${NODE_ENV}/eezi/ecs/runtime`,
  ECS_CLUSTER_NAME: `${NODE_ENV}-eezi-ecs-runtime-cluster`,
  ECS_TASK_DEFINITION: `${NODE_ENV}-eezi-vite-runtime`,
};

const computedSettings = {
  VITE_ORIGIN: IS_TEST_BUILD
    ? `http://localhost:${baseSettings.APP_PORT}`
    : `https://app.eezi.dev`,
  HMR_PORT: IS_TEST_BUILD ? baseSettings.APP_PORT : 443,
  NETWORK_NAME_PREFIX: "eezi-task",
  APP_CONTAINER_NAME_PREFIX: "eezi-vite",
  PROXY_CONTAINER_NAME_PREFIX: `eezi-proxy`,
  PNPM_STORE_VOLUME_PREFIX: "eezi-pnpm",
};

export default { ...baseSettings, ...dbSettings, ...awsSettings, ...computedSettings };
