import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  WsExceptionFilter,
} from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { ServiceError } from "@resync-game-framework/api";
import { Socket } from "socket.io";
import { convertErrorToString } from "../library/utils/convertErroToString";

@Catch()
export class CustomWsExceptionFilter implements WsExceptionFilter {
  private logger = new Logger("WsException");

  catch(exception: WsException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const serviceError: ServiceError = {
      code: httpStatus,
      message: convertErrorToString(exception),
      path: "web-socket",
      type: "error",
    };

    this.logger.error(serviceError.message);

    client.emit("exception", serviceError);
  }

  public customCatch(exception: Error, client: Socket, data: object) {
    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const serviceError: ServiceError = {
      code: httpStatus,
      message: JSON.stringify(exception),
      path: "web-socket",
      type: "error",
    };

    this.logger.error(
      `Custom caught error: ${serviceError.message} ${JSON.stringify(data)}`,
    );

    client.emit("exception", serviceError);
  }
}
