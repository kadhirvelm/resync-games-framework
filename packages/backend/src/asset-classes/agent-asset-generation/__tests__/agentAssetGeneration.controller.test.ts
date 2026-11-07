import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { HttpStatus, RequestMethod } from "@nestjs/common";
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { AgentAssetGenerationController } from "../agentAssetGeneration.controller";

/**
 * Reads Nest route metadata from one controller method.
 * @param method - Controller method name
 * @returns Recorded path, request method, and response status metadata
 */
function route(method: "enqueue" | "status") {
  const handler = AgentAssetGenerationController.prototype[method];
  return {
    httpCode: Reflect.getMetadata(HTTP_CODE_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    path: Reflect.getMetadata(PATH_METADATA, handler),
  };
}

describe("AgentAssetGenerationController", () => {
  test("exposes an accepted POST and a job-id GET", () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, AgentAssetGenerationController),
    ).toBe("agent/assets/generations");
    expect(route("enqueue")).toEqual({
      httpCode: HttpStatus.ACCEPTED,
      method: RequestMethod.POST,
      path: "/",
    });
    expect(route("status")).toEqual({
      httpCode: undefined,
      method: RequestMethod.GET,
      path: ":jobId",
    });
  });
});
