import type { MessageEvent, StreamableFile } from "@nestjs/common";
import { Delete, Get, Patch, Post, Put, Sse } from "@nestjs/common";
import {
  FileDownloadService,
  FileUploadService,
  isServiceEndpointFileDownloadDefinition,
  isServiceEndpointFileUploadDefinition,
  isServiceEndpointStreamingDefinition,
  NonStreamingService,
  type RemoveExtendsString,
  type Service,
  type ServiceEndpoint,
  type ServiceEndpointDefinition,
  type StreamingEvent,
  StreamingService,
} from "@resync-game-framework/api";
import type { Request } from "express";
import { ResyncGameFrameworkObservable } from "../library/ResyncGameFrameworkObservable";

type ServiceRequest = Request;

/**
 * Narrow Nest's MessageEvent to our response definition.
 */
export type NestJSStreamingEvent<Chunk, Finish> = Omit<
  MessageEvent,
  "data" | "type" | "id"
> &
  StreamingEvent<Chunk, Finish>;

/**
 * The return type for a streaming endpoint in the controller.
 */
export type ValidServiceControllerStreamingReturnType<Chunk, Finish> =
  | ResyncGameFrameworkObservable<Chunk, Finish>
  | Promise<ResyncGameFrameworkObservable<Chunk, Finish>>;

/**
 * The response type for a streaming endpoint.
 */
export type ValidServiceControllerStreamingResponse<
  S extends Service,
  Key extends keyof S,
  Implementation extends StreamingService,
> =
  | ((
      payload?: S[Key]["payload"],
      request?: ServiceRequest,
    ) => ValidServiceControllerStreamingReturnType<
      Implementation["chunk"],
      Implementation["finish"]
    >)
  | ((
      request?: ServiceRequest,
      payload?: S[Key]["payload"],
    ) => ValidServiceControllerStreamingReturnType<
      Implementation["chunk"],
      Implementation["finish"]
    >);

/**
 * The return type for a non-streaming endpoint in the controller.
 */
export type ValidServiceControllerNonStreamingReturnType<T> = T | Promise<T>;

/**
 * The response type for a non-streaming endpoint.
 */
export type ValidServiceControllerResponse<
  S extends Service,
  Key extends keyof S,
  Implementation extends NonStreamingService,
> =
  | ((
      payload?: S[Key]["payload"],
      request?: ServiceRequest,
    ) => ValidServiceControllerNonStreamingReturnType<
      Implementation["response"]
    >)
  | ((
      request?: ServiceRequest,
      payload?: S[Key]["payload"],
    ) => ValidServiceControllerNonStreamingReturnType<
      Implementation["response"]
    >);

/**
 * The return type for a file download endpoint in the controller.
 */
export type ValidServiceControllerFileDownloadReturnType =
  | StreamableFile
  | Promise<StreamableFile>;

/**
 * The response type for a file download endpoint.
 */
export type ValidServiceControllerFileDownloadResponse<
  S extends Service,
  Key extends keyof S,
> =
  | ((
      payload?: S[Key]["payload"],
      request?: ServiceRequest,
    ) => ValidServiceControllerFileDownloadReturnType)
  | ((
      request?: ServiceRequest,
      payload?: S[Key]["payload"],
    ) => ValidServiceControllerFileDownloadReturnType);

/**
 * The response type for a file upload endpoint.
 * Don't forget to use the FileInterceptor in the controller method using the fieldName from the ServiceEndpointFileUploadDefinition.
 *
 * @example
 * @getDecorator(StorageServiceDefinition.endpoints.uploadImage)
 * @UseInterceptors(FileInterceptor(StorageServiceDefinition.endpoints.uploadImage.fieldName))
 * public async uploadImage(
 *   @UploadedFile(
 *     new ParseFilePipe({
 *       validators: [
 *         new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
 *         new FileTypeValidator({ fileType: /(jpeg|jpg|png|webp)$/i }),
 *       ],
 *     }),
 *   )
 *   file: UploadedRequestFile,
 *   @Req() request: Request,
 * ) {
 *   return this.storageService.uploadImage(
 *     request.user.organizationId,
 *     request.user.userId,
 *     file.buffer,
 *     file.mimetype.split("/")[1] ?? "",
 *   );
 * }
 */
/**
 * File received by a multipart upload endpoint.
 */
export interface UploadedRequestFile {
  buffer: Buffer;
  mimetype: string;
}

export type ValidServiceControllerFileUploadResponse<
  Implementation extends FileUploadService,
> = (
  file: UploadedRequestFile,
  request?: ServiceRequest,
  payload?: { payload?: string },
) => ValidServiceControllerNonStreamingReturnType<Implementation["response"]>;

/**
 * The response type for a multiple file upload endpoint.
 * Use FilesInterceptor and @UploadedFiles in the controller when multipleFiles is true.
 *
 * @example
 * @getDecorator(ImportServiceDefinition.endpoints.importDocumentDocxBulk)
 * @UseInterceptors(FilesInterceptor(ImportServiceDefinition.endpoints.importDocumentDocxBulk.fieldName))
 * public async importDocumentDocxBulk(
 *   @UploadedFiles(...) files: UploadedRequestFile[],
 *   @Req() request: Request,
 *   @Body() payload: { payload?: string },
 * ) {
 *   const payloadString = JSON.parse(payload.payload);
 *   // Process multiple files...
 * }
 */
export type ValidServiceControllerFileUploadMultipleResponse<
  Implementation extends FileUploadService,
> = (
  files: UploadedRequestFile[],
  request?: ServiceRequest,
  payload?: { payload?: string },
) => ValidServiceControllerNonStreamingReturnType<Implementation["response"]>;

/**
 * Used to declare the interface for the expected backend implementation service.
 */
export type ServiceControllerInterface<S extends Service> = {
  /**
   * For each method in the controller class, it has to match the return type definition.
   *
   * Specifically, if the endpoint is streaming, the return type must be ValidServiceControllerStreamingReturnType.
   * If the endpoint is not streaming, the return type must be ValidServiceControllerNonStreamingReturnType.
   */
  [Key in keyof RemoveExtendsString<S>]: S[Key] extends StreamingService
    ? ValidServiceControllerStreamingResponse<S, Key, S[Key]>
    : S[Key] extends FileDownloadService
      ? ValidServiceControllerFileDownloadResponse<S, Key>
      : S[Key] extends FileUploadService
        ? S[Key]["multipleFiles"] extends true
          ? ValidServiceControllerFileUploadMultipleResponse<S[Key]>
          : ValidServiceControllerFileUploadResponse<S[Key]>
        : S[Key] extends NonStreamingService
          ? ValidServiceControllerResponse<S, Key, S[Key]>
          : never;
};

/**
 * All endpoints are POST requests for now, but this pseudo-decorator allows us to
 * change that in the future if needed.
 */
export function getDecorator<S extends Service, Key extends keyof S>(
  endpoint: ServiceEndpoint<S, Key>,
) {
  const endpointDefinition = endpoint as ServiceEndpointDefinition;

  if (typeof endpointDefinition === "string") {
    return Post(endpointDefinition);
  }

  if (isServiceEndpointStreamingDefinition(endpointDefinition)) {
    return Sse(endpointDefinition.path);
  }

  if (isServiceEndpointFileDownloadDefinition(endpointDefinition)) {
    return Post(endpointDefinition.path);
  }

  if (isServiceEndpointFileUploadDefinition(endpointDefinition)) {
    return Post(endpointDefinition.path);
  }

  if (endpointDefinition.method === "POST") {
    return Post(endpointDefinition.path);
  }

  if (endpointDefinition.method === "PUT") {
    return Put(endpointDefinition.path);
  }

  if (endpointDefinition.method === "DELETE") {
    return Delete(endpointDefinition.path);
  }

  if (endpointDefinition.method === "PATCH") {
    return Patch(endpointDefinition.path);
  }

  return Get(endpointDefinition.path);
}
