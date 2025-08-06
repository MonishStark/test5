/** @format */

import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { corsOptions, logCorsConfiguration } from "./cors-config";
import {
	securityHeaders,
	apiRateLimit,
	validateRequestSize,
	requestLogger,
	securityErrorHandler,
} from "./security-middleware";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { logger } from "../shared/logger";

// Constants
const LOG_LINE_TRUNCATE_LENGTH = 79;

const app = express();

// Apply security headers first
app.use(securityHeaders);

// Apply request logging
app.use(requestLogger);

// Apply CORS middleware early in the pipeline
app.use(cors(corsOptions));

// Log CORS configuration on startup
logCorsConfiguration();

// Apply rate limiting to API routes
app.use("/api", apiRateLimit);

// Validate request size
app.use(validateRequestSize);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
	const start = Date.now();
	const path = req.path;
	// skipcq: JS-0126
	let responseBody: Record<string, unknown> | undefined = undefined;

	const originalResJson = res.json;
	res.json = function (bodyJson, ...args) {
		responseBody = bodyJson;
		return originalResJson.apply(res, [bodyJson, ...args]);
	};

	res.on("finish", () => {
		const duration = Date.now() - start;
		if (path.startsWith("/api")) {
			let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
			if (responseBody) {
				logLine += ` :: ${JSON.stringify(responseBody)}`;
			}

			if (logLine.length > LOG_LINE_TRUNCATE_LENGTH + 1) {
				// skipcq: JS-0246
				logLine = logLine.slice(0, LOG_LINE_TRUNCATE_LENGTH) + "…";
			}

			log(logLine);
		}
	});

	next();
});

(async () => {
	const server = await registerRoutes(app);

	// Simple setup for development mode
	console.log("🚀 Starting server in simple mode");

	// Define interface for HTTP errors with status codes
	interface HttpError extends Error {
		status?: number;
		statusCode?: number;
	}

	app.use(
		(err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
			const status = err.status || err.statusCode || 500;
			const message = err.message || "Internal Server Error";

			// Log the error instead of throwing it to prevent application crashes
			logger.error(
				"Error handler middleware caught error",
				err,
				{
					status,
				},
				"HTTP"
			);

			res.status(status).json({ message });
		}
	);

	// Apply security error handler after main error handler
	app.use(securityErrorHandler);

	if (app.get("env") === "development") {
		await setupVite(app, server);
	} else {
		await serveStatic(app);
	}

	const port = 5000;
	server.listen(
		{
			port,
			host: "localhost",
		},
		() => {
			log(`serving on port ${port}`);
			log("Server running in simple mode");
		}
	);

	// Graceful shutdown handling
	process.on("SIGTERM", async () => {
		log("SIGTERM received, shutting down gracefully...");

		try {
			server.close(() => {
				log("Server shutdown completed");
			});
		} catch (error) {
			log(
				`Error during shutdown: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
		}
	});

	process.on("SIGINT", async () => {
		log("SIGINT received, shutting down gracefully...");

		try {
			server.close(() => {
				log("Server shutdown completed");
			});
		} catch (error) {
			log(
				`Error during shutdown: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
		}
	});
})();
