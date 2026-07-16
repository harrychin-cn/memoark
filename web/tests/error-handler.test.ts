import { describe, expect, it, vi } from "vitest";
import { handleError } from "@/lib/error";

describe("handleError", () => {
  it("shows a localized fallback instead of leaking an English implementation error", () => {
    const toast = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    handleError(new Error("Server failed in English"), toast, {
      context: "Update profile",
      fallbackMessage: "更新资料失败",
    });

    expect(toast).toHaveBeenCalledWith("更新资料失败");
    expect(consoleError).toHaveBeenCalledWith("[Update profile]", expect.any(Error));
    consoleError.mockRestore();
  });
});
