import { Code, ConnectError } from "@connectrpc/connect";

export type SaveErrorKind = "network" | "server";

function isFetchTypeError(error: unknown): boolean {
  return error instanceof Error && error.name === "TypeError";
}

export const errorService = {
  classifySaveError(error: unknown): SaveErrorKind {
    if (error instanceof ConnectError) {
      if (error.code === Code.Unavailable || error.code === Code.DeadlineExceeded) {
        return "network";
      }

      if (error.code === Code.Unknown && isFetchTypeError(error.cause)) {
        return "network";
      }

      // A concrete Connect response (for example InvalidArgument or
      // PermissionDenied) is a server rejection even if navigator.onLine has
      // changed by the time the catch handler runs.
      if (error.code !== Code.Unknown) {
        return "server";
      }
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "network";
    }

    return "server";
  },

  getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "rawMessage" in error) {
      return (error as { rawMessage?: string }).rawMessage || "An error occurred";
    }

    // Handle ConnectError or errors with details property
    if (error && typeof error === "object" && "details" in error) {
      return (error as { details?: string }).details || "An error occurred";
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "An unknown error occurred";
  },
};
