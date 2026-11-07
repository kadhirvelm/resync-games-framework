import { Module, type Provider, type Type } from "@nestjs/common";
import { MastraModule } from "src/mastra/mastra.module";
import { ModelModule } from "src/model/model.module";

/**
 * Options for an asset-class Nest module.
 * @property controller - Controller from {@link createAssetClassController}
 * @property providers - The class service and any class-local providers. Agents are injected from `MastraModule`.
 * @property extraImports - Modules beyond `ModelModule` and `MastraModule`
 */
export interface AssetClassModuleOptions {
  controller: Type;
  extraImports?: Type[];
  providers: Provider[];
}

/**
 * Builds a Nest module that can generate and list one asset class.
 * `ModelModule` and `MastraModule` are always imported; pass anything else
 * (for example the game-asset module) through `extraImports`.
 * @param options - Controller, providers, and extra imports for this class
 * @returns A module class to register in `AssetClassesModule`
 */
export function createAssetClassModule(options: AssetClassModuleOptions): Type {
  const extraImports = options.extraImports ?? [];

  @Module({
    controllers: [options.controller],
    exports: options.providers,
    imports: [ModelModule, MastraModule, ...extraImports],
    providers: options.providers,
  })
  class GeneratedAssetClassModule {}

  Object.defineProperty(GeneratedAssetClassModule, "name", {
    value: `${options.controller.name.replace(/Controller$/, "")}Module`,
  });

  return GeneratedAssetClassModule;
}
