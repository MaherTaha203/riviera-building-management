import { Request, Response, NextFunction } from "express";

/**
 * Minimal structural type that matches any Zod schema's safeParse interface.
 * Using a structural type avoids importing zod directly into api-server while
 * still giving full type safety for the validated body.
 */
interface SafeParseSchema<T> {
  safeParse(data: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } };
}

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * On success, req.body is replaced with the parsed (coerced) data.
 * On failure, responds 400 with a structured error listing all invalid fields.
 */
export function validateBody<T>(schema: SafeParseSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
