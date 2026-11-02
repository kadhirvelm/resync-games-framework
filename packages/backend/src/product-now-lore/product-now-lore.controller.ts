import { Body, Controller, Req } from "@nestjs/common";
import {
  type ProductNowLoreServiceApi,
  ProductNowLoreServiceDefinition,
} from "@resync-game-framework/api";
import type { Request } from "express";
import {
  getDecorator,
  type ServiceControllerInterface,
} from "../genericTypes/controller";
import { requireActiveProductNowSession } from "../product-now-mcp/productNowSessionContext";
import { ProductNowLoreService } from "./product-now-lore.service";

type Api = ProductNowLoreServiceApi;

/**
 * Game-scoped ProductNow lore reads and writes for the browser's session.
 */
@Controller(ProductNowLoreServiceDefinition.controller)
export class ProductNowLoreController
  implements ServiceControllerInterface<ProductNowLoreServiceApi>
{
  public constructor(private readonly loreService: ProductNowLoreService) {}

  /**
   * Creates a document in the game's folder.
   * @param payload - Game id, name, verbatim body, and optional layout guidance
   * @param _request - Incoming request; the interceptor already bound the session
   * @returns The new document's id and URL
   */
  @getDecorator(ProductNowLoreServiceDefinition.endpoints.createDocument)
  public async createDocument(
    @Body() payload: Api["createDocument"]["payload"],
    @Req() _request: Request,
  ): Promise<Api["createDocument"]["response"]> {
    return this.loreService.createDocument(
      requireActiveProductNowSession(),
      payload.gameId,
      payload,
    );
  }

  /**
   * Sends edit instructions for a document in the game's folder.
   * @param payload - Game id, document id, and instructions
   * @param _request - Incoming request; the interceptor already bound the session
   * @returns The edited document's id
   */
  @getDecorator(ProductNowLoreServiceDefinition.endpoints.editDocument)
  public async editDocument(
    @Body() payload: Api["editDocument"]["payload"],
    @Req() _request: Request,
  ): Promise<Api["editDocument"]["response"]> {
    return this.loreService.editDocument(
      requireActiveProductNowSession(),
      payload.gameId,
      payload.documentId,
      payload.instructions,
    );
  }

  /**
   * Reports whether ProductNow is still writing a document.
   * @param payload - Game id and document id
   * @param _request - Incoming request; the interceptor already bound the session
   * @returns `running` or `idle`
   */
  @getDecorator(ProductNowLoreServiceDefinition.endpoints.getEditStatus)
  public async getEditStatus(
    @Body() payload: Api["getEditStatus"]["payload"],
    @Req() _request: Request,
  ): Promise<Api["getEditStatus"]["response"]> {
    return this.loreService.getEditStatus(
      requireActiveProductNowSession(),
      payload.gameId,
      payload.documentId,
    );
  }

  /**
   * Resolves the game's folder and lists its documents.
   * @param payload - Game id
   * @param _request - Incoming request; the interceptor already bound the session
   * @returns The game's folder and documents
   */
  @getDecorator(ProductNowLoreServiceDefinition.endpoints.getGameSpace)
  public async getGameSpace(
    @Body() payload: Api["getGameSpace"]["payload"],
    @Req() _request: Request,
  ): Promise<Api["getGameSpace"]["response"]> {
    return this.loreService.getGameSpace(
      requireActiveProductNowSession(),
      payload.gameId,
    );
  }

  /**
   * Reads one document from the game's folder.
   * @param payload - Game id and document id
   * @param _request - Incoming request; the interceptor already bound the session
   * @returns The document's HTML and plain text
   */
  @getDecorator(ProductNowLoreServiceDefinition.endpoints.readDocument)
  public async readDocument(
    @Body() payload: Api["readDocument"]["payload"],
    @Req() _request: Request,
  ): Promise<Api["readDocument"]["response"]> {
    return this.loreService.readDocument(
      requireActiveProductNowSession(),
      payload.gameId,
      payload.documentId,
    );
  }

  /**
   * Appends one entry to a named document, creating it when missing.
   * @param payload - Game id, document name, entry, and optional heading
   * @param _request - Incoming request; the interceptor already bound the session
   * @returns The document written to and whether it was created
   */
  @getDecorator(ProductNowLoreServiceDefinition.endpoints.recordEntry)
  public async recordEntry(
    @Body() payload: Api["recordEntry"]["payload"],
    @Req() _request: Request,
  ): Promise<Api["recordEntry"]["response"]> {
    return this.loreService.recordEntry(
      requireActiveProductNowSession(),
      payload.gameId,
      payload,
    );
  }

  /**
   * Searches documents in the game's folder.
   * @param payload - Game id and query
   * @param _request - Incoming request; the interceptor already bound the session
   * @returns Matching passages
   */
  @getDecorator(ProductNowLoreServiceDefinition.endpoints.search)
  public async search(
    @Body() payload: Api["search"]["payload"],
    @Req() _request: Request,
  ): Promise<Api["search"]["response"]> {
    return this.loreService.search(
      requireActiveProductNowSession(),
      payload.gameId,
      payload.query,
    );
  }
}
