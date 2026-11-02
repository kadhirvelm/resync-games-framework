import { Module } from "@nestjs/common";
import { ConfigurationModule } from "src/configuration/configuration.module";
import { RedisService } from "./redis.service";

@Module({
  exports: [RedisService],
  imports: [ConfigurationModule],
  providers: [RedisService],
})
export class RedisModule {}
