import { NextFunction, Request, Response } from "express";
import { TokenExpiredError } from "jsonwebtoken";
import { verifyAccessToken, type UserRole } from "../modules/auth/token.service";
import { ApiError } from "../utils/ApiError";

export function authGuard(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Please sign in to continue."));
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    // TOKEN_EXPIRED is the one distinction worth exposing: the client uses it
    // to decide whether to silently call /auth/refresh or bounce to sign-in.
    if (err instanceof TokenExpiredError) {
      return next(ApiError.unauthorized("Your session has expired.", "TOKEN_EXPIRED"));
    }
    next(ApiError.unauthorized("Your session is no longer valid. Please sign in again."));
  }
}

/**
 * Restricts a route to the given roles. Must be mounted after authGuard.
 *
 * This is the actual access control. The client also hides admin navigation,
 * but that's presentation — hiding a link stops nobody from calling the API.
 */
export function roleGuard(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized("Please sign in to continue."));
    if (!roles.includes(req.user.role)) {
      // 403 with no hint about what the route does or who may use it.
      return next(ApiError.forbidden("You don't have access to that."));
    }
    next();
  };
}
