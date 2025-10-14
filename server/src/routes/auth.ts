import { Router } from "express";
import sessionRouter from "./session";
import tokenRouter from "./token";

const router = Router();

// Mount token and session under /auth/token and /auth/session
router.use("/token", tokenRouter);
router.use("/session", sessionRouter);

export default router;
