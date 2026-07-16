export function getErrorMessage(error: unknown, fallback = "Unknown error"): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return fallback;
}

export function handleError(
  error: unknown,
  toast: (message: string) => void,
  options?: {
    context?: string;
    fallbackMessage?: string;
    onError?: (error: unknown) => void;
  },
): void {
  const errorMessage = options?.fallbackMessage ?? getErrorMessage(error);

  if (options?.context) console.error(`[${options.context}]`, error);
  else console.error(error);
  toast(errorMessage);
  options?.onError?.(error);
}

export function isError(value: unknown): value is Error {
  return value instanceof Error;
}
