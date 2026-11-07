import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { Module } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { MastraModule } from "src/mastra/mastra.module";
import { ModelModule } from "src/model/model.module";
import { createAssetClassModule } from "../createAssetClassModule";

describe("createAssetClassModule", () => {
  @Module({})
  class ExtraModule {}

  class ExampleController {}

  class ExampleService {}

  const assetClassModule = createAssetClassModule({
    controller: ExampleController,
    extraImports: [ExtraModule],
    providers: [ExampleService],
  });

  test("imports the model and agent modules plus any extras", () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, assetClassModule),
    ).toEqual([ModelModule, MastraModule, ExtraModule]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, assetClassModule),
    ).toEqual([ExampleController]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, assetClassModule),
    ).toEqual([ExampleService]);
    expect(assetClassModule.name).toBe("ExampleModule");
  });
});
