// ---------------------------------------------------------------------------
// Tiny HTTP client used by the frontend to talk to /api.
//
// Responsibilities:
//   - send the session cookie on every request
//   - serialize the request body as JSON
//   - turn any non-2xx response into an ApiError
//   - treat 204 No Content as a successful empty response
//
// Components should never call fetch() directly: error handling lives here.
// ---------------------------------------------------------------------------

/** Status used when the request never reached the server (offline, DNS, CORS...). */
export const NETWORK_ERROR_STATUS = 0;

/** Error thrown by apiFetch when the server answers with a non-2xx status. */
export class ApiError extends Error {
  /** HTTP status code, or 0 when the request could not be sent. */
  readonly status: number;
  /** Machine-readable code from the JSON body, e.g. "invalid_credentials". */
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type ApiFetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Plain object serialized as JSON. Leave undefined for requests without body. */
  body?: unknown;
  /** Lets the caller cancel the request (used by React effects on unmount). */
  signal?: AbortSignal;
};

/**
 * Calls the API and parses the JSON response.
 *
 * @throws {ApiError} when the response status is not 2xx.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      // The session lives in an HttpOnly cookie, so it must be sent along.
      // "same-origin" is enough: the API is on the same domain as the app.
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // An aborted request is not an API error: the caller asked for it.
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(NETWORK_ERROR_STATUS, "network_error");
  }

  // 204 No Content: success with no body to parse (used by /api/auth/logout).
  if (response.status === 204) return undefined as T;

  // Read as text first, so an HTML error page does not raise a SyntaxError.
  const text = await response.text();
  const data: unknown = text === "" ? null : parseJson(text);

  if (!response.ok) {
    throw new ApiError(response.status, readErrorCode(data, response.status));
  }

  return data as T;
}

/** Parses JSON, returning null instead of throwing. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Extracts `{ error: "..." }` from a body, with a fallback for other formats. */
function readErrorCode(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return error;
  }
  return `http_${status}`;
}