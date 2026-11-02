import {
  AVAILABLE_SERVICES,
  type AvailableServices,
} from "@resync-game-framework/api";
import { noop } from "lodash-es";
import { constructSingleServiceCaller } from "./constructSingleServiceCaller";
import type { AvailableServiceCaller, ServiceCaller } from "./types";

/**
 * Creates service callers for all available backend services.
 * @param hostUrl - Base URL for the API
 * @param getAccessToken - Function to get the current access token
 * @param onUnauthenticated - Callback when user is not authenticated (after retry)
 * @param onForbidden - Callback when user is forbidden from accessing a resource
 * @param onRefreshAccessToken - Function to force-refresh the access token on 401
 * @param additionalHeaders - Optional additional headers to include in requests
 * @returns Object containing all service callers
 */
export function getAvailableServiceCallers(
  hostUrl: string,
  additionalHeaders?: Record<string, string>,
): AvailableServiceCaller {
  const services: {
    [key: string]: ServiceCaller<AvailableServices[keyof AvailableServices]>;
  } = {};

  for (const [key, serviceDefinition] of Object.entries(AVAILABLE_SERVICES)) {
    const typedKey = key as keyof AvailableServices;
    services[typedKey] = constructSingleServiceCaller<typeof typedKey>(
      hostUrl,
      serviceDefinition,
      () => Promise.resolve("hard-coded-token"),
      noop,
      noop,
      () => Promise.resolve("hard-coded-token"),
      additionalHeaders,
    );
  }

  return services as AvailableServiceCaller;
}
