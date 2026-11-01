import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Header, Query, Req, Res } from "@nestjs/common";
import {
  type ProductNowMcpServiceApi,
  ProductNowMcpServiceDefinition,
  type ProductNowMcpStatus,
} from "@towers-of-coreborn/api";
import type { Request, Response } from "express";
import { ConfigurationService } from "../configuration/configuration.service";
import {
  getDecorator,
  type ServiceControllerInterface,
} from "../genericTypes/controller";
import { ProductNowMcpService } from "./product-now-mcp.service";
import {
  buildFrontendRedirect,
  sanitizeReturnPath,
} from "./productNowReturnPath";
import {
  readActiveProductNowSession,
  requireActiveProductNowSession,
} from "./productNowSessionContext";
import {
  PRODUCT_NOW_SESSION_COOKIE_NAME,
  productNowSessionCookieOptions,
  readProductNowSessionId,
  requireProductNowSessionId,
} from "./productNowSessionCookie";

/**
 * ProductNow OAuth browser flow and authenticated MCP operations.
 */
@Controller(ProductNowMcpServiceDefinition.controller)
export class ProductNowMcpController
  implements ServiceControllerInterface<ProductNowMcpServiceApi>
{
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly productNowMcpService: ProductNowMcpService,
  ) {}

  /**
   * Calls a ProductNow MCP tool for the current browser.
   * @param payload - Tool name and arguments
   * @param request - Incoming request carrying the session cookie
   * @returns Raw MCP tool result
   */
  @getDecorator(ProductNowMcpServiceDefinition.endpoints.callTool)
  public async callTool(
    @Body() payload: ProductNowMcpServiceApi["callTool"]["payload"],
    @Req() _request: Request,
  ): Promise<unknown> {
    return this.productNowMcpService.callTool(
      requireActiveProductNowSession(),
      payload.name,
      payload.arguments,
    );
  }

  /**
   * Starts ProductNow OAuth and redirects the browser to ProductNow.
   * @param request - Incoming browser request
   * @param response - Express response used for cookie and redirect
   * @param returnTo - Frontend path to come back to; unsafe values are ignored
   */
  @Get("oauth/connect")
  public async connect(
    @Req() request: Request,
    @Res() response: Response,
    @Query("returnTo") returnTo?: string,
  ): Promise<void> {
    const sessionId = readProductNowSessionId(request) ?? randomUUID();
    response.cookie(
      PRODUCT_NOW_SESSION_COOKIE_NAME,
      sessionId,
      productNowSessionCookieOptions(
        this.configurationService.get("BACKEND_API_URL"),
      ),
    );

    const authorizationUrl = await this.productNowMcpService.beginAuthorization(
      sessionId,
      sanitizeReturnPath(returnTo),
    );
    response.redirect(authorizationUrl.toString());
  }

  /**
   * Removes ProductNow credentials for the current browser.
   * @param _payload - Unused empty payload
   * @param _request - Incoming request; the interceptor already resolved the session
   * @returns Disconnected status
   */
  @getDecorator(ProductNowMcpServiceDefinition.endpoints.disconnect)
  public async disconnect(
    @Body() _payload: null,
    @Req() _request: Request,
  ): Promise<ProductNowMcpStatus> {
    const sessionId = readActiveProductNowSession();
    if (sessionId) {
      await this.productNowMcpService.disconnect(sessionId);
    }
    return { connected: false };
  }

  /**
   * Reports whether the current browser has connected ProductNow.
   * @param _payload - Unused empty payload
   * @param _request - Incoming request; the interceptor already resolved the session
   * @returns Connection status
   */
  @getDecorator(ProductNowMcpServiceDefinition.endpoints.getStatus)
  public async getStatus(
    @Body() _payload: null,
    @Req() _request: Request,
  ): Promise<ProductNowMcpStatus> {
    return { connected: readActiveProductNowSession() !== undefined };
  }

  /**
   * Lists ProductNow MCP tools for the current browser.
   * @param _payload - Unused empty payload
   * @param _request - Incoming request; the interceptor already resolved the session
   * @returns ProductNow tool declarations
   */
  @getDecorator(ProductNowMcpServiceDefinition.endpoints.listTools)
  public async listTools(
    @Body() _payload: null,
    @Req() _request: Request,
  ): Promise<ProductNowMcpServiceApi["listTools"]["response"]> {
    return this.productNowMcpService.listTools(
      requireActiveProductNowSession(),
    );
  }

  /**
   * Completes ProductNow OAuth and returns the browser to the game.
   * @param request - Incoming callback request carrying the session cookie
   * @param response - Express response used for the final redirect
   * @param code - OAuth authorization code
   * @param state - OAuth state
   * @param error - OAuth error code from ProductNow
   */
  @Get("oauth/callback")
  public async oauthCallback(
    @Req() request: Request,
    @Res() response: Response,
    @Query("code") code?: string,
    @Query("state") state?: string,
    @Query("error") error?: string,
  ): Promise<void> {
    const frontendUrl = this.configurationService.get("FRONTEND_URL");

    if (error) {
      response.redirect(
        buildFrontendRedirect(frontendUrl, undefined, {
          productNow: "error",
          reason: error,
        }),
      );
      return;
    }

    if (!code || !state) {
      response.redirect(
        buildFrontendRedirect(frontendUrl, undefined, {
          productNow: "error",
          reason: "missing_code",
        }),
      );
      return;
    }

    const { returnTo } = await this.productNowMcpService.finishAuthorization(
      this.requireSessionId(request),
      code,
      state,
    );
    response.redirect(
      buildFrontendRedirect(frontendUrl, sanitizeReturnPath(returnTo), {
        productNow: "connected",
      }),
    );
  }

  /**
   * Reads the session cookie or rejects the request.
   * @param request - Incoming request
   * @returns Browser session identifier
   */
  private requireSessionId(request: Request): string {
    return requireProductNowSessionId(request);
  }
}

/**
 * Serves the OAuth Client ID Metadata Document that identifies Towers of Coreborn.
 */
@Controller(".well-known/oauth-client-metadata")
export class ProductNowClientMetadataController {
  public constructor(
    private readonly productNowMcpService: ProductNowMcpService,
  ) {}

  /**
   * Returns the CIMD whose URL is used as the OAuth client_id.
   * @returns OAuth client metadata including client_id
   */
  @Get("towers-of-coreborn.json")
  @Header("Cache-Control", "public, max-age=300")
  public getClientMetadata(): Record<string, unknown> {
    const provider = this.productNowMcpService.createProvider("metadata");
    return {
      ...provider.clientMetadata,
      client_id: provider.clientMetadataUrl,
    };
  }
}
