export type ErrorCode =
  | "VALIDATION_ERROR"
  | "CODE_NOT_FOUND"
  | "CODE_EXPIRED"
  | "ALREADY_JOINED"
  | "NOT_FOUND"
  | "FORBIDDEN";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  CODE_NOT_FOUND: 404,
  CODE_EXPIRED: 410,
  ALREADY_JOINED: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
