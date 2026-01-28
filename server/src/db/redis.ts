import Redis from "ioredis";
import logger from "@/logger";

const redis = new Redis({
  host: "127.0.0.1",
  port: 6379,

  // reconnect forever with backoff
  retryStrategy: (retryCount: number) => {
    const delay = Math.min(retryCount * 200, 2000);
    return delay;
  },

  maxRetriesPerRequest: null,
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("ready", () => {
  logger.info("Redis ready");
});

redis.on("error", (err: any) => {
  logger.error("Redis error:", err);
});

redis.on("close", () => {
  logger.warn("Redis connection closed");
});

redis.on("reconnecting", (delay: number) => {
  logger.warn(`Redis reconnecting in ${delay}ms`);
});

export default redis;
