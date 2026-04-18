/**
 * JWT authentication middleware for Express routes.
 * Validates Bearer tokens and attaches the decoded user payload to req.user.
 * Also re-exports JWT_SECRET so auth routes can sign tokens with the same key.
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/**
 * Express middleware that enforces JWT authentication on a route.
 * Reads the Authorization header, verifies the token, and populates req.user.
 * Responds 401 if the header is absent, malformed, or the token is invalid/expired.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  // Slice off the "Bearer " prefix (7 characters) to get the raw token.
  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export { JWT_SECRET };
