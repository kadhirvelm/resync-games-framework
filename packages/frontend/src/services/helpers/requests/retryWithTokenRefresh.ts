import { isServiceError, type ServiceError } from "@resync-game-framework/api";

export { isServiceError };

interface RetryWithTokenRefreshSuccess {
  response: Response;
}

/**
 * Runs a request and retries it once with a refreshed token when the API returns 401.
 */
export async function retryWithTokenRefresh(
  makeRequest: (tokenOverride?: string) => Promise<Response>,
  onRefreshAccessToken: () => Promise<string | null>,
  onUnauthenticated: () => void,
  path: string,
): Promise<RetryWithTokenRefreshSuccess | ServiceError> {
  const response = await makeRequest();

  if (response.status !== 401) {
    return { response };
  }

  const refreshedToken = await onRefreshAccessToken();

  if (refreshedToken == null) {
    onUnauthenticated();
    return unauthorized(path, await readUnauthorizedMessage(response));
  }

  const retryResponse = await makeRequest(refreshedToken);

  if (retryResponse.status !== 401) {
    return { response: retryResponse };
  }

  onUnauthenticated();
  return unauthorized(path, await readUnauthorizedMessage(retryResponse));
}

/**
 * Builds the 401 result. ProductNow connection failures are also 401s, so the
 * server message is kept when the body has one.
 * @param path - Request path
 * @param serverMessage - Message from the API body, when it could be read
 * @returns Service error for the caller
 */
function unauthorized(path: string, serverMessage?: string): ServiceError {
  return {
    code: 401,
    message: serverMessage ?? "Unauthorized - please sign in again",
    path,
    type: "error",
  };
}

/**
 * Reads a service-error message from a 401 body.
 * @param response - Unauthorized response
 * @returns Message text, or undefined when the body is not JSON
 */
async function readUnauthorizedMessage(
  response: Response,
): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string" &&
      body.message !== ""
    ) {
      return body.message;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
