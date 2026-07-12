import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

type Execute = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const HermesReceiptSchema = z.object({
  success: z.literal(true),
  platform: z.literal("telegram"),
  chat_id: z.union([z.string(), z.number()]).transform(String),
  message_id: z.union([z.string(), z.number()]).transform(String),
  mirrored: z.boolean().default(false),
});

export type TelegramReceipt = {
  platform: "telegram";
  chatId: string;
  messageId: string;
  mirrored: boolean;
};

const executeHermes: Execute = async (file, args) => {
  const { stdout, stderr } = await execFileAsync(file, args, { windowsHide: true, encoding: "utf8" });
  return { stdout, stderr };
};

export function telegramChatIdFromTarget(target: string): string {
  const match = /^telegram:([^\s]+)$/.exec(target);
  if (!match) throw new Error("an explicit Telegram target is required");
  return match[1];
}

export async function sendTelegramMessage(
  target: string,
  message: string,
  execute: Execute = executeHermes,
): Promise<TelegramReceipt> {
  const expectedChatId = telegramChatIdFromTarget(target);
  const result = await execute("hermes", ["send", "--to", target, "--json", message]);
  let receipt: z.infer<typeof HermesReceiptSchema>;
  try {
    receipt = HermesReceiptSchema.parse(JSON.parse(result.stdout));
  } catch {
    throw new Error(result.stderr.trim() || "Hermes did not return an authoritative Telegram delivery receipt");
  }
  if (receipt.chat_id !== expectedChatId) {
    throw new Error("Hermes receipt does not match the bound Telegram target");
  }
  return {
    platform: receipt.platform,
    chatId: receipt.chat_id,
    messageId: receipt.message_id,
    mirrored: receipt.mirrored,
  };
}
