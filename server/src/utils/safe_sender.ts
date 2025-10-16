import log from "@/logger";
import { Response } from "express";

export function safeSend(
  res: Response,
  chatId: number,
  type: string,
  payload: any
): void {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – allow variadic args beyond `data`
    res.write(`data: ${JSON.stringify({ chatId, type, ...payload })}\n\n`);
  } catch (error) {
    log.debug(
      `safeSend: failed to send on type "${type}" because: ${(error as Error).message}`
    );
  }
}
