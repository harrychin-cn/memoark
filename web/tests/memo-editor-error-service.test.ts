import { Code, ConnectError } from "@connectrpc/connect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorService } from "@/components/MemoEditor/services/errorService";

describe("memo editor save error classification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats an offline browser as a network failure", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    expect(errorService.classifySaveError(new Error("anything"))).toBe("network");
  });

  it.each([Code.Unavailable, Code.DeadlineExceeded])("treats Connect code %s as a network failure", (code) => {
    expect(errorService.classifySaveError(new ConnectError("transport failed", code))).toBe("network");
  });

  it("recognizes the fetch TypeError wrapped by Connect", () => {
    const error = new ConnectError("Failed to fetch", Code.Unknown, undefined, undefined, new TypeError("Failed to fetch"));

    expect(errorService.classifySaveError(error)).toBe("network");
  });

  it.each([Code.InvalidArgument, Code.PermissionDenied, Code.Internal])("keeps Connect code %s as a server failure", (code) => {
    expect(errorService.classifySaveError(new ConnectError("server rejected save", code))).toBe("server");
  });

  it("keeps an explicit validation response as a server failure even if the browser now reports offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    expect(errorService.classifySaveError(new ConnectError("invalid memo", Code.InvalidArgument))).toBe("server");
  });

  it("keeps ordinary application errors as server failures", () => {
    expect(errorService.classifySaveError(new Error("validation failed"))).toBe("server");
  });
});
