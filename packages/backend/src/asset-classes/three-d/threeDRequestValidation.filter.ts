import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

/** Returns bounded, actionable 400 responses for malformed 3D requests. */
@Catch(ZodError)
export class ThreeDRequestValidationFilter implements ExceptionFilter {
  /** Converts schema issues into the shared service-error shape. */
  public catch(error: ZodError, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    context
      .getResponse<Response>()
      .status(400)
      .json({
        code: 400,
        message: error.issues
          .slice(0, 5)
          .map(
            (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`,
          )
          .join("; "),
        path: context.getRequest<{ url: string }>().url,
        type: "error",
      });
  }
}
