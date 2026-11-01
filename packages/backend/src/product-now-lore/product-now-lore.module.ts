import { Module } from "@nestjs/common";
import { ProductNowMcpModule } from "../product-now-mcp/product-now-mcp.module";
import { ProductNowLoreController } from "./product-now-lore.controller";
import { ProductNowLoreService } from "./product-now-lore.service";

/**
 * Game-scoped ProductNow lore storage. Import this module to inject
 * {@link ProductNowLoreService} into a gateway, agent, or other service.
 */
@Module({
  controllers: [ProductNowLoreController],
  exports: [ProductNowLoreService],
  imports: [ProductNowMcpModule],
  providers: [ProductNowLoreService],
})
export class ProductNowLoreModule {}
