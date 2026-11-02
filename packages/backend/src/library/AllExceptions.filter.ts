import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { ServiceError } from "@resync-game-framework/api";
import { ConfigurationService } from "../configuration/configuration.service";
import { convertErrorToString } from "./utils/convertErroToString";

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private logger = new Logger("AllExceptionsFilter");

  constructor(private readonly configurationService: ConfigurationService) {
    this.logger.log("AllExceptionsFilter initialized");
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const request = context.getRequest();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const includeStack =
      this.configurationService.get("NODE_ENV") === "development";

    const serviceError: ServiceError = {
      code: httpStatus,
      message: convertErrorToString(exception, { includeStack }),
      path: request.url,
      type: "error",
    };

    if (httpStatus === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception },
        `Internal server error on ${request.url}`,
      );
    }

    response.status(httpStatus).json(serviceError);
  }
}
