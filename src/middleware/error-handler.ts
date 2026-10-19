import type { ErrorRequestHandler } from "express";
import { AppError } from "../shared/app-error.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      status: "error",
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {})
    });
    return;
  }

  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
      ? error.status
      : 500;

  if (status >= 500) {
    console.error(
      "Unhandled request error:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  const message =
    status === 400
      ? "Invalid request body"
      : status === 413
        ? "Request body too large"
        : status < 500
          ? "Request could not be processed"
          : "Internal server error";

  res.status(status).json({ status: "error", message });
};
