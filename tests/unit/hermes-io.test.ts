import { describe, expect, it, vi } from "vitest";

import { sendTelegramMessage, telegramChatIdFromTarget } from "../../packages/hermes-io/src/telegram";

describe("hermes_io Telegram boundary", () => {
  it("uses only the Hermes send interface and returns the provider receipt", async () => {
    const execute = vi.fn(async () => ({
      stdout: JSON.stringify({ success: true, platform: "telegram", chat_id: "123", message_id: "42", mirrored: false }),
      stderr: "",
    }));

    const receipt = await sendTelegramMessage("telegram:123", "Booking request", execute);

    expect(execute).toHaveBeenCalledWith("hermes", ["send", "--to", "telegram:123", "--json", "Booking request"]);
    expect(receipt).toEqual({ platform: "telegram", chatId: "123", messageId: "42", mirrored: false });
  });

  it("fails closed when Hermes does not return an authoritative receipt", async () => {
    const execute = vi.fn(async () => ({ stdout: JSON.stringify({ success: false }), stderr: "delivery failed" }));
    await expect(sendTelegramMessage("telegram:123", "Booking request", execute)).rejects.toThrow("delivery failed");
  });

  it("normalizes the bound chat identity and rejects a receipt for any other chat", async () => {
    expect(telegramChatIdFromTarget("telegram:123")).toBe("123");

    const execute = vi.fn(async () => ({
      stdout: JSON.stringify({ success: true, platform: "telegram", chat_id: "999", message_id: "42", mirrored: false }),
      stderr: "",
    }));

    await expect(sendTelegramMessage("telegram:123", "Booking request", execute)).rejects.toThrow("bound Telegram target");
  });
});
