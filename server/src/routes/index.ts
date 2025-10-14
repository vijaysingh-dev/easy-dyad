import { Router } from "express";
import appsRouter from "./app";
import chatRouter from "./chat";
import settingsRouter from "./settings";
import helpRouter from "./help";
import commonRouter from "./common";
import nodeRouter from "./node";
import versionRouter from "./version";
import authRouter from "./auth";
import windowRouter from "./window";
import integrationsRouter from "./integrations";
import toolsRouter from "./tools";
import deployRouter from "./deploy";
import miscRouter from "./misc";
import proposalsRouter from "./proposals";
import promptsRouter from "./prompts";

const router = Router();

router.use("/apps", appsRouter);
router.use("/chat", chatRouter);
router.use("/settings", settingsRouter);
router.use("/help", helpRouter);
router.use("/common", commonRouter);
router.use("/node", nodeRouter);
router.use("/version", versionRouter);
router.use("/auth", authRouter);
router.use("/window", windowRouter);
router.use("/integrations", integrationsRouter);
router.use("/tools", toolsRouter);
router.use("/deploy", deployRouter);
router.use("/misc", miscRouter);
router.use("/proposals", proposalsRouter);
router.use("/prompts", promptsRouter);

export default router;
