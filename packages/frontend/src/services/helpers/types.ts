import type {
  AvailableServices,
  FileDownloadService,
  FileUploadService,
  NonStreamingService,
  RemoveExtendsString,
  Service,
  ServiceError,
  StreamingEventChunk,
  StreamingEventLoading,
  StreamingService,
} from "@resync-game-framework/api";

/**
 * The service caller for a non-streaming endpoint.
 */
type NonStreamingServiceCaller<Implementation extends NonStreamingService> =
  Implementation["payload"] extends null
    ? () => Promise<Implementation["response"] | ServiceError>
    : (
        payload: Implementation["payload"],
      ) => Promise<Implementation["response"] | ServiceError>;

/**
 * The React handlers for a streaming events.
 */
export interface StreamingRequestClient<Chunk> {
  /**
   * The handler for a chunk of data.
   */
  onLoadChunk?: (chunk: StreamingEventChunk<Chunk>) => void;
  /**
   * The handler for a loading event.
   */
  onLoading?: (loading: StreamingEventLoading) => void;
}

/**
 * The service caller for a streaming endpoint. The callback is used to respond to a chunk of data
 */
type StreamingServiceCaller<
  S extends Service,
  Key extends keyof RemoveExtendsString<S>,
  Implementation extends StreamingService,
> = Implementation["payload"] extends null
  ? (
      eventHandlers: StreamingRequestClient<Implementation["chunk"]>,
    ) => Promise<Implementation["finish"] | ServiceError>
  : (
      eventHandlers: StreamingRequestClient<Implementation["chunk"]>,
      payload: S[Key]["payload"],
    ) => Promise<Implementation["finish"] | ServiceError>;

/**
 * The service caller for a file download endpoint.
 */
type FileDownloadServiceCaller<Implementation extends FileDownloadService> =
  Implementation["payload"] extends null
    ? (fileName: string) => Promise<null | ServiceError>
    : (
        fileName: string,
        payload: Implementation["payload"],
      ) => Promise<null | ServiceError>;

/**
 * The service caller for a file upload endpoint.
 * Supports both single file and multiple file uploads.
 */
type FileUploadServiceCaller<Implementation extends FileUploadService> =
  Implementation["multipleFiles"] extends true
    ? (
        files: File[],
        payload?: unknown,
      ) => Promise<Implementation["response"] | ServiceError>
    : (
        file: File,
        payload?: unknown,
      ) => Promise<Implementation["response"] | ServiceError>;

/**
 * Generic convenience type for constructing the single service caller values.
 */
export type ServiceCallerValue<
  S extends Service,
  Key extends keyof RemoveExtendsString<S>,
> = S[Key] extends StreamingService
  ? StreamingServiceCaller<S, Key, S[Key]>
  : S[Key] extends FileDownloadService
    ? FileDownloadServiceCaller<S[Key]>
    : S[Key] extends FileUploadService
      ? FileUploadServiceCaller<S[Key]>
      : S[Key] extends NonStreamingService
        ? NonStreamingServiceCaller<S[Key]>
        : never;

/**
 * Used to call on the backend services from the browser for a specific service.
 */
export type ServiceCaller<S extends Service> = {
  [Key in keyof RemoveExtendsString<S>]: ServiceCallerValue<S, Key>;
};

/**
 * Stitches all the service callers together for the backend.
 */
export type AvailableServiceCaller = {
  [Key in keyof AvailableServices]: ServiceCaller<AvailableServices[Key]>;
};
