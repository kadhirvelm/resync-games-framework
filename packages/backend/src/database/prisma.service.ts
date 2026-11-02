import { Injectable, Logger } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@resync-game-framework/database";
import { ConfigurationService } from "../configuration/configuration.service";
@Injectable()
export class PrismaService {
  public logger = new Logger("PrismaClient");

  public client: PrismaClient;

  constructor(private configService: ConfigurationService) {
    const environment = this.configService.get("NODE_ENV");
    this.logger.log(`Creating prisma client - ${environment}`);

    if (environment === "production") {
      // Pass PoolConfig so PrismaPg builds the pool with its own bundled `pg`.
      // A Pool from this package's `pg` is a different class (adapter-pg nests pg@8.20
      // while the app depends on pg@8.23), so `instanceof Pool` fails and the types disagree.
      // sslmode=no-verify is acceptable in production because we are in the same VPC.
      this.client = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: `${this.configService.get("DATABASE_HOST_URL")}?sslmode=no-verify`,
        }),
      });
    } else {
      const adapter = new PrismaPg({
        // In development, the end of the string is the DB name and the sslmode parameter, so we need to add the sslmode parameter to the end of the string
        connectionString: `${this.configService.get("DATABASE_HOST_URL")}&sslmode=disable`,
      });
      this.client = new PrismaClient({
        adapter: adapter,
      });
    }
  }
}
