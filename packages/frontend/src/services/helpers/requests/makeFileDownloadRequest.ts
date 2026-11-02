import { FileDownloadDetails, ServiceError } from "@resync-game-framework/api";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { constructHeaders } from "../constructHeaders";
import { isServiceError, retryWithTokenRefresh } from "./retryWithTokenRefresh";

/**
 * Creates a file download request function.
 * Automatically retries once on 401 with a refreshed token before redirecting to login.
 *
 * @param resolvedSlug - The full URL for the endpoint
 * @param getAccessToken - Function to get the current access token
 * @param onUnauthenticated - Callback when user is not authenticated (after retry)
 * @param onForbidden - Callback when user is forbidden from accessing a resource
 * @param onRefreshAccessToken - Function to force-refresh the access token on 401
 * @param fileDetails - Details about the file format (extension, etc.)
 * @param additionalHeaders - Optional additional headers to include in requests
 * @returns Function that downloads a file with the given filename
 */
export function makeFileDownloadRequest(
  resolvedSlug: string,
  getAccessToken: () => Promise<string>,
  onUnauthenticated: () => void,
  onForbidden: () => void,
  onRefreshAccessToken: () => Promise<string | null>,
  fileDetails: FileDownloadDetails,
  additionalHeaders?: Record<string, string>,
): (fileName: string, payload?: unknown) => Promise<null | ServiceError> {
  return async (
    fileName: string,
    payload?: unknown,
  ): Promise<null | ServiceError> => {
    try {
      const makeRequest = async (tokenOverride?: string) => {
        return fetch(resolvedSlug, {
          body: payload == null ? undefined : JSON.stringify(payload),
          headers: await constructHeaders(
            getAccessToken,
            additionalHeaders,
            tokenOverride,
          ),
          method: "POST",
        });
      };

      const result = await retryWithTokenRefresh(
        makeRequest,
        onRefreshAccessToken,
        onUnauthenticated,
        resolvedSlug,
      );

      if (isServiceError(result)) {
        return result;
      }

      const { response } = result;

      if (response.status === 403) {
        onForbidden();

        return {
          code: 403,
          message: "Forbidden - you are not authorized to access this resource",
          path: resolvedSlug,
          type: "error",
        };
      }

      if (!response.ok) {
        return {
          code: response.status,
          message: response.statusText,
          path: resolvedSlug,
          type: "error",
        };
      }

      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Strip characters that are invalid in filenames on Windows/Mac/Linux
      const sanitizedFileName = fileName.replace(/[<>:"/\\|?*]/g, "");
      link.download = `${sanitizedFileName}.${fileDetails.extension}`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return null;
    } catch (error) {
      return {
        code: 500,
        message: `Error captured in the browser: ${convertErrorToString(error)}`,
        path: resolvedSlug,
        type: "error",
      };
    }
  };
}
