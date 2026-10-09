export type ErrorCode =
  | "unauthenticated"
  | "permission-denied"
  | "invalid-argument"
  | "failed-precondition"
  | "already-exists"
  | "aborted"
  | "resource-exhausted"
  | "unavailable"
  | "deadline-exceeded"
  | "not-found"
  | "internal"
  | "cancelled";

/** Domain error codes match the durable command protocol, without SDK payloads. */
export class HttpsError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function databaseError(
  error: { code?: string; message?: string },
): HttpsError {
  const code = error.message?.match(
    /^(aborted|already-exists|failed-precondition|invalid-argument)$/,
  )?.[1];
  if (code) {
    return new HttpsError(
      code as ErrorCode,
      "This action could not be completed.",
    );
  }
  return new HttpsError(
    error.code === "40001"
      ? "aborted"
      : error.code === "42501"
      ? "permission-denied"
      : error.code === "23505"
      ? "already-exists"
      : error.code?.startsWith("23")
      ? "failed-precondition"
      : "unavailable",
    "This action could not be completed.",
  );
}
