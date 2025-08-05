/** @format */

import type { CorsOptions } from "cors";

/**
 * CORS Configuration for Production
 *
 * This configuration provides secure CORS settings that can be customized
 * for different environments (development, staging, production).
 */

// Allowed origins for different environments
const getAllowedOrigins = (): string[] => {
	const nodeEnv = process.env.NODE_ENV || "development";

	switch (nodeEnv) {
		case "production":
			return [
				process.env.FRONTEND_URL || "https://your-domain.com",
				process.env.ADMIN_URL || "https://admin.your-domain.com",
				// Add your production domains here
			].filter(Boolean); // Remove any undefined values

		case "staging":
			return [
				process.env.STAGING_FRONTEND_URL || "https://staging.your-domain.com",
				"http://localhost:3000", // For local testing against staging
				"http://localhost:5173", // Vite dev server
			].filter(Boolean);

		case "development":
		default:
			return [
				"http://localhost:3000",
				"http://localhost:5000", // Express server self-requests
				"http://localhost:5173", // Vite dev server
				"http://localhost:4173", // Vite preview
				"http://127.0.0.1:3000",
				"http://127.0.0.1:5000",
				"http://127.0.0.1:5173",
				"http://127.0.0.1:4173",
			];
	}
};

// Dynamic origin validation function
// skipcq: JS-0045
const corsOrigin = (
	origin: string | undefined,
	callback: (err: Error | null, allow?: boolean) => void
	// skipcq: JS-0045
) => {
	const allowedOrigins = getAllowedOrigins();

	// Allow requests with no origin (like mobile apps or curl requests) in development
	if (!origin && process.env.NODE_ENV === "development") {
		return callback(null, true);
	}

	// Check if the origin is in the allowed list
	if (!origin || allowedOrigins.indexOf(origin) !== -1) {
		callback(null, true);
	} else {
		console.warn(`🚫 CORS blocked request from origin: ${origin}`);
		callback(new Error(`Origin ${origin} not allowed by CORS policy`));
	}
};

// Production-ready CORS configuration
export const corsOptions: CorsOptions = {
	origin: corsOrigin,
	methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
	allowedHeaders: [
		"Content-Type",
		"Authorization",
		"X-Requested-With",
		"Accept",
		"Origin",
		"Cache-Control",
		"X-File-Name",
	],
	exposedHeaders: ["Content-Length", "Content-Type", "X-Total-Count"],
	credentials: true, // Allow cookies and authorization headers
	maxAge: 86400, // Cache preflight response for 24 hours
	preflightContinue: false,
	optionsSuccessStatus: 204, // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Specific CORS configuration for file upload endpoints
export const uploadCorsOptions: CorsOptions = {
	...corsOptions,
	methods: ["POST", "OPTIONS"],
	allowedHeaders: [
		"Content-Type",
		"Authorization",
		"X-Requested-With",
		"Accept",
		"Origin",
		"Cache-Control",
		"X-File-Name",
		"Content-Disposition",
		"X-Upload-Progress",
	],
};

// Specific CORS configuration for API endpoints
export const apiCorsOptions: CorsOptions = {
	...corsOptions,
	exposedHeaders: [
		"Content-Length",
		"Content-Type",
		"X-Total-Count",
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
	],
};

// WebSocket CORS configuration (for Socket.IO)
export const websocketCorsOptions = {
	origin: getAllowedOrigins(),
	methods: ["GET", "POST"],
	credentials: true,
	transports: ["websocket", "polling"] as const,
};

// Utility function to log CORS configuration on startup
export const logCorsConfiguration = () => {
	const nodeEnv = process.env.NODE_ENV || "development";
	const allowedOrigins = getAllowedOrigins();

	console.log(`🔒 CORS Configuration (${nodeEnv}):`);
	console.log(`   Allowed Origins: ${allowedOrigins.join(", ")}`);
	console.log(`   Credentials: ${corsOptions.credentials}`);
	console.log(`   Max Age: ${corsOptions.maxAge}s`);
};
