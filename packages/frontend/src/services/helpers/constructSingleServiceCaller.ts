import {
  type AvailableServices,
  isServiceEndpointFileDownloadDefinition,
  isServiceEndpointFileUploadDefinition,
  isServiceEndpointStreamingDefinition,
  type ServiceDefinition,
  type ServiceEndpointDefinition,
} from "@resync-game-framework/api";
import { makeFetchRequest } from "./requests/makeFetchRequest";
import { makeFileDownloadRequest } from "./requests/makeFileDownloadRequest";
import { makeFileUploadRequest } from "./requests/makeFileUploadRequest";
import { makeGetRequest } from "./requests/makeGetRequest";
import { makeMultipleFileUploadRequest } from "./requests/makeMultipleFileUploadRequest";
import { makeStreamingRequest } from "./requests/makeStreamingRequest";
import type { ServiceCaller, ServiceCallerValue } from "./types";

/**
 * Constructs a service caller object for a single service definition.
 * @param hostUrl - Base URL for the API
 * @param serviceDefinition - The service definition from the API package
 * @param getAccessToken - Function to get the current access token
 * @param onUnauthenticated - Callback when user is not authenticated (after retry)
 * @param onForbidden - Callback when user is forbidden from accessing a resource
 * @param onRefreshAccessToken - Function to force-refresh the access token on 401
 * @param additionalHeaders - Optional additional headers to include in requests
 * @returns Service caller with methods for each endpoint
 */
export function constructSingleServiceCaller<
  Key extends keyof AvailableServices,
>(
  hostUrl: string,
  serviceDefinition: ServiceDefinition<AvailableServices[Key]>,
  getAccessToken: () => Promise<string>,
  onUnauthenticated: () => void,
  onForbidden: () => void,
  onRefreshAccessToken: () => Promise<string | null>,
  additionalHeaders?: Record<string, string>,
): ServiceCaller<AvailableServices[Key]> {
  const serviceCaller = {} as ServiceCaller<AvailableServices[Key]>;

  for (const [endpoint, slug] of Object.entries(serviceDefinition.endpoints)) {
    const typedEndpoint = endpoint as keyof ServiceCaller<
      AvailableServices[Key]
    >;

    const typedSlug = slug as ServiceEndpointDefinition;

    if (typeof typedSlug === "string") {
      const resolvedSlug = `${hostUrl}/${serviceDefinition.controller}/${slug}`;
      serviceCaller[typedEndpoint] = makeFetchRequest(
        resolvedSlug,
        getAccessToken,
        onUnauthenticated,
        onForbidden,
        onRefreshAccessToken,
        additionalHeaders,
      ) as ServiceCallerValue<AvailableServices[Key], typeof typedEndpoint>;
      continue;
    }

    const resolvedSlug = `${hostUrl}/${serviceDefinition.controller}/${typedSlug.path}`;

    if (isServiceEndpointStreamingDefinition(typedSlug)) {
      serviceCaller[typedEndpoint] = makeStreamingRequest(
        resolvedSlug,
        getAccessToken,
        onUnauthenticated,
        onForbidden,
        onRefreshAccessToken,
        additionalHeaders,
      ) as ServiceCallerValue<AvailableServices[Key], typeof typedEndpoint>;
      continue;
    }

    if (isServiceEndpointFileDownloadDefinition(typedSlug)) {
      serviceCaller[typedEndpoint] = makeFileDownloadRequest(
        resolvedSlug,
        getAccessToken,
        onUnauthenticated,
        onForbidden,
        onRefreshAccessToken,
        typedSlug.fileDetails,
        additionalHeaders,
      ) as ServiceCallerValue<AvailableServices[Key], typeof typedEndpoint>;
      continue;
    }

    if (isServiceEndpointFileUploadDefinition(typedSlug)) {
      // Check if this is a bulk upload endpoint
      if (typedSlug.multipleFiles) {
        serviceCaller[typedEndpoint] = makeMultipleFileUploadRequest(
          resolvedSlug,
          getAccessToken,
          onUnauthenticated,
          onForbidden,
          onRefreshAccessToken,
          typedSlug.fieldName,
          additionalHeaders,
        ) as ServiceCallerValue<AvailableServices[Key], typeof typedEndpoint>;
      } else {
        serviceCaller[typedEndpoint] = makeFileUploadRequest(
          resolvedSlug,
          getAccessToken,
          onUnauthenticated,
          onForbidden,
          onRefreshAccessToken,
          typedSlug.fieldName,
          additionalHeaders,
        ) as ServiceCallerValue<AvailableServices[Key], typeof typedEndpoint>;
      }
      continue;
    }

    if (typedSlug.method === "GET") {
      serviceCaller[typedEndpoint] = makeGetRequest(
        resolvedSlug,
        getAccessToken,
        onUnauthenticated,
        onForbidden,
        onRefreshAccessToken,
        additionalHeaders,
      ) as ServiceCallerValue<AvailableServices[Key], typeof typedEndpoint>;
      continue;
    }

    serviceCaller[typedEndpoint] = makeFetchRequest(
      resolvedSlug,
      getAccessToken,
      onUnauthenticated,
      onForbidden,
      onRefreshAccessToken,
      additionalHeaders,
      typedSlug.method,
    ) as ServiceCallerValue<AvailableServices[Key], typeof typedEndpoint>;
  }

  return serviceCaller;
}
