import db from "@/db";
import { messages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Message } from "@/shared/eeziTypes";

export const execPromise = promisify(exec);

export async function executeAddDependency({
  packages,
  message,
  appPath,
}: {
  packages: string[];
  message: Message;
  appPath: string;
}) {
  const packageStr = packages.join(" ");

  const { stdout, stderr } = await execPromise(
    `(pnpm add ${packageStr}) || (npm install --legacy-peer-deps ${packageStr})`,
    {
      cwd: appPath,
    }
  );
  const installResults = stdout + (stderr ? `\n${stderr}` : "");

  // Update the message content with the installation results
  const updatedContent = message.content.replace(
    new RegExp(
      `<eezi-add-dependency packages="${packages.join(
        " "
      )}">[^<]*</eezi-add-dependency>`,
      "g"
    ),
    `<eezi-add-dependency packages="${packages.join(
      " "
    )}">${installResults}</eezi-add-dependency>`
  );

  // Save the updated message back to the database
  await db
    .update(messages)
    .set({ content: updatedContent })
    .where(eq(messages.id, message.id));
}
