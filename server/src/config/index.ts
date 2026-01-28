import dotenv from "dotenv";
dotenv.config();

const NODE_ENV =
  (process.env.NODE_ENV as "local" | "dev" | "qa" | "uat" | "prod" | "dr") || "local";
const IS_TEST_BUILD = NODE_ENV === "local";

const APP_URL = {
  local: "localhost",
  dev: "dev.easy-dyad.ai",
  qa: "qa.easy-dyad.ai",
  qadr: "qa.easy-dyad.ai",
  uat: "uat.easy-dyad.ai",
  prod: "easy-dyad.ai",
  dr: "easy-dyad.ai",
};

const baseSettings = {
  NODE_ENV: NODE_ENV,
  IS_TEST_BUILD: IS_TEST_BUILD,
  PORT: Number(process.env.PORT || 8000),

  BASE_URL: `${NODE_ENV}.easy-dyad.ai`,
  DOCKER_APP_IMAGE: "easy-dyad/node-runtime:22",
  DOCKER_PROXY_IMAGE: "easy-dyad/easy-proxy:latest",

  APP_PORT: 3000,
  PROXY_PORT: 8080,
  APP_HOST: "0.0.0.0",
};

const dbSettings = {
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: Number(process.env.DB_PORT || 5432),
  DB_USER: process.env.DB_USER || "postgres",
  DB_PASSWORD: process.env.DB_PASSWORD || "postgres",
  DB_NAME: process.env.DB_NAME || "easy_dyad",
};

const awsSettings = {
  AWS_REGION: process.env.AWS_REGION || "eu-north-1",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",

  S3_BUCKET_NAME: `${NODE_ENV}-easy-bucket`,

  ECS_SUBNETS: [
    //   "subnet-079d2d4798eaac68a",
    //   "subnet-07f98367835262433",
    "subnet-066bb76fdef0ee82e",
  ],
  ECS_SECURITY_GROUPS: ["sg-0c8328f486f2a2d0d"],
  ECS_LOG_GROUP: `/${NODE_ENV}/easy-dyad/ecs/runtime`,
  ECS_CLUSTER_NAME: `${NODE_ENV}-easy-ecs-runtime-cluster`,
  ECS_TASK_DEFINITION: `${NODE_ENV}-easy-vite-runtime`,
};

const computedSettings = {
  APP_HOST_SUFIX: `preview.${APP_URL[NODE_ENV]}`,
  HMR_PROTOCOL: IS_TEST_BUILD ? "ws" : "wss",
  HMR_HOST_SUFIX: `sandbox.${APP_URL[NODE_ENV]}`,
  HMR_PORT: IS_TEST_BUILD ? baseSettings.APP_PORT : 443,

  NETWORK_NAME_PREFIX: "easy-task",
  APP_CONTAINER_NAME_PREFIX: "easy-vite",
  PROXY_CONTAINER_NAME_PREFIX: `easy-proxy`,

  NPM_CACHE_VOLUME: "easy-npm-cache",
  PNPM_STORE_VOLUME: "easy-pnpm-store",
};

export default { ...baseSettings, ...dbSettings, ...awsSettings, ...computedSettings };
