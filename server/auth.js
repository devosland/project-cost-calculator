/**
 * Express router for authentication routes (/api/auth/*).
 * Handles user registration, login, current-user lookup, and password reset flow.
 * Login and register endpoints are rate-limited to 10 requests per 15-minute window
 * to mitigate credential-stuffing attacks.
 */
import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { createUser, findUserByEmail, createPasswordReset, findValidReset, markResetUsed, updateUserPassword } from './db.js';
import { authMiddleware, JWT_SECRET } from './middleware.js';

const router = Router();

// Shared rate limiter for endpoints that accept credentials.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

/**
 * POST /api/auth/register
 * Creates a new account and returns a signed JWT.
 * Emails are normalised (trimmed + lowercased) before storage.
 * Body: { name: string, email: string, password: string (min 6 chars) }
 * Returns: 201 { token, user: { id, email, name } }
 * Errors: 400 invalid email/name/password | 409 email already registered
 */
router.post('/register', authLimiter, (req, res) => {
  try {
    const { name, password } = req.body;
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate name
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate password
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existing = findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = createUser(email, name.trim(), passwordHash);

    // Generate JWT — 30-day expiry balances UX (infrequent logins) with security.
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user with email + password and returns a signed JWT.
 * Returns the same 401 message for "user not found" and "wrong password"
 * to avoid leaking which emails are registered (user enumeration defence).
 * Body: { email: string, password: string }
 * Returns: 200 { token, user: { id, email, name } }
 * Errors: 400 missing fields | 401 invalid credentials
 */
router.post('/login', authLimiter, (req, res) => {
  try {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = findUserByEmail(email);
    if (!user) {
      // Deliberately vague: do not reveal whether the email exists.
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile from the decoded JWT payload.
 * No database hit — the JWT payload already contains id/email/name.
 * Returns: 200 { user: { id, email, name } }
 * Errors: 401 if no valid JWT
 */
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

/**
 * POST /api/auth/forgot-password
 * Initiates the password reset flow by creating a 1-hour single-use token.
 * Always returns { success: true } even when the email doesn't exist to prevent
 * email enumeration attacks. In production, the resetToken should be emailed
 * rather than returned in the response body.
 * Body: { email: string }
 * Returns: 200 { success: true, resetToken?: string }
 * Errors: 400 missing email
 */
router.post('/forgot-password', (req, res) => {
  try {
    const email = req.body.email ? req.body.email.trim().toLowerCase() : '';

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = findUserByEmail(email);
    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return res.json({ success: true });
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    createPasswordReset(user.id, token, expiresAt);

    res.json({ success: true, resetToken: token });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/reset-password
 * Completes the password reset flow. Validates the token, updates the hash,
 * and marks the token as used (single-use invariant enforced in findValidReset).
 * The order of updateUserPassword → markResetUsed is important: the password must
 * be updated before the token is invalidated so a DB error doesn't leave the
 * token consumed but the password unchanged.
 * Body: { token: string, password: string (min 6 chars) }
 * Returns: 200 { success: true }
 * Errors: 400 missing fields | 400 password too short | 400 invalid/expired token
 */
router.post('/reset-password', (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const reset = findValidReset(token);
    if (!reset) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    updateUserPassword(reset.user_id, passwordHash);
    markResetUsed(token);

    res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
