/** @format */

import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { sanitizeForLog } from "../shared/logger";

/**
 * Security Middleware Configuration
 *
 * This file contains security middleware for production deployment including
 * rate limiting, request validation, and security headers.
 */

// Rate limiting configuration for different endpoints
export const apiRateLimit = rateLimit({
	windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 minutes
	max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10), // 100 requests per window
	message: {
		error: "Too many API requests",
		retryAfter: "Please try again later",
	},
	standardHeaders: true,
	legacyHeaders: false,
	// Skip rate limiting for localhost in development
	skip: (req: Request) => {
		if (process.env.NODE_ENV === "development") {
			return req.ip === "127.0.0.1" || req.ip === "::1";
		}
		return false;
	},
});

// Stricter rate limiting for upload endpoints
export const uploadRateLimit = rateLimit({
	windowMs: 60 * 1000, // 1 minute
	max: 5, // 5 uploads per minute
	message: {
		error: "Too many upload attempts",
		retryAfter: "Please wait before uploading again",
	},
	standardHeaders: true,
	legacyHeaders: false,
});

// Security headers middleware
// skipcq: JS-0045
export const securityHeaders = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	// Prevent MIME type sniffing
	res.setHeader("X-Content-Type-Options", "nosniff");

	// Prevent clickjacking
	res.setHeader("X-Frame-Options", "DENY");

	// Enable XSS protection
	res.setHeader("X-XSS-Protection", "1; mode=block");

	// Strict transport security (HTTPS only)
	if (process.env.NODE_ENV === "production") {
		res.setHeader(
			"Strict-Transport-Security",
			"max-age=31536000; includeSubDomains"
		);
	}

	// Content Security Policy
	const csp = [
		"default-src 'self'",
		process.env.NODE_ENV === "development"
			? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" // Allow inline scripts for development only
			: "script-src 'self'",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"font-src 'self' https://fonts.gstatic.com",
		"img-src 'self' data: blob:",
		"media-src 'self' blob:",
		"connect-src 'self' ws: wss:",
		"worker-src 'self' blob:",
	].join("; ");

	res.setHeader("Content-Security-Policy", csp);

	// Referrer policy
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

	// Permissions policy
	res.setHeader(
		"Permissions-Policy",
		"geolocation=(), microphone=(), camera=()"
	);

	next();
};

// Request size validation

export const validateRequestSize = (
	req: Request,
	res: Response,
	next: NextFunction
	// skipcq: JS-0045
) => {
	const contentLength = req.get("Content-Length");
	const maxSize = parseInt(process.env.MAX_FILE_SIZE || "104857600", 10); // 100MB default

	if (contentLength && parseInt(contentLength, 10) > maxSize) {
		return res.status(413).json({
			error: "Request too large",
			maxSize: `${maxSize / 1024 / 1024}MB`,
		});
	}

	next();
};

// Origin validation middleware (additional layer beyond CORS)

export const validateOrigin = (
	req: Request,
	res: Response,
	next: NextFunction
	// skipcq: JS-0045
) => {
	const origin = req.get("Origin");
	const referer = req.get("Referer");

	// Skip validation for non-browser requests in development
	if (process.env.NODE_ENV === "development" && !origin && !referer) {
		return next();
	}

	// Log suspicious requests
	if (origin && !isValidOrigin(origin)) {
		console.warn(
			`🚫 Suspicious request from origin: ${sanitizeForLog(origin)}`
		);
	}

	next();
};

// Helper function to validate origins
function isValidOrigin(origin: string): boolean {
	const allowedDomains = [
		process.env.FRONTEND_URL,
		process.env.ADMIN_URL,
		process.env.STAGING_FRONTEND_URL,
		"http://localhost:3000",
		"http://localhost:5173",
		"http://localhost:4173",
	].filter(Boolean) as string[];

	return allowedDomains.some((domain) => origin.startsWith(domain));
}

// Request logging middleware
// skipcq: JS-0045
export const requestLogger = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	const timestamp = new Date().toISOString();
	const ip = req.ip || req.connection.remoteAddress;
	const userAgent = req.get("User-Agent");

	// Log API requests with additional details
	if (req.path.startsWith("/api")) {
		console.log(
			`${timestamp} - ${req.method} ${
				req.path
			} - IP: ${ip} - UA: ${userAgent?.substring(0, 50)}`
		);
	}

	next();
};

// Error handling for security middleware
// skipcq: JS-0045
export const securityErrorHandler = (
	error: Error,
	req: Request,
	res: Response,
	next: NextFunction
	// skipcq: JS-0045
) => {
	// Don't expose internal error details in production
	if (process.env.NODE_ENV === "production") {
		console.error("Security middleware error:", error);
		return res.status(500).json({
			error: "Internal server error",
		});
	}

	next(error);
};
