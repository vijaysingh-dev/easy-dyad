import logger from "@/logger";
import { Response } from "express";

export function safeSend(res: Response, eventType: string, payload: any): void {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – allow variadic args beyond `data`
    res.write(`data: ${JSON.stringify({ eventType, ...payload })}\n\n`);
  } catch (error) {
    logger.debug(
      `safeSend: failed to send on type "${eventType}" because: ${(error as Error).message}`
    );
  }
}
