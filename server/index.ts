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
import { InputSanitizer } from "./security-utils.js";
import path from "path";
import { storage } from "./storage";
// Use simple job queue by default (no Redis dependency)
import { jobQueueManager } from "./jobQueueSimple";

// Constants
const LOG_LINE_TRUNCATE_LENGTH = 79;

/**
 * Helper function to retrieve the actual file path for a track from the database
 * @param trackId - The ID of the track
 * @returns Promise<string> - The original file path or throws an error if not found
 */
async function getTrackFilePath(trackId: number): Promise<string> {
	const track = await storage.getAudioTrack(trackId);
	if (!track) {
		throw new Error(`Track with ID ${trackId} not found`);
	}
	return track.originalPath;
}

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
	let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

	const originalResJson = res.json;
	res.json = function (bodyJson, ...args) {
		capturedJsonResponse = bodyJson;
		return originalResJson.apply(res, [bodyJson, ...args]);
	};

	res.on("finish", () => {
		const duration = Date.now() - start;
		if (path.startsWith("/api")) {
			let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
			if (capturedJsonResponse) {
				logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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

	// Simple setup for development mode (no Redis/WebSocket requirements)
	console.log("🚀 Starting server in simple mode (no Redis required)");

	// Add basic job queue routes
	app.get("/api/health/job-queue", async (req, res) => {
		const health = await jobQueueManager.getHealth();
		res.json(health);
	});

	app.get("/api/admin/queue-stats", async (req, res) => {
		const stats = await jobQueueManager.getQueueStats();
		res.json(stats);
	});

	// skipcq: JS-0045
	app.post("/api/tracks/:id/process-async", async (req, res) => {
		try {
			// Enhanced security: Validate and sanitize ID parameter
			const trackId = InputSanitizer.sanitizeIntParam(
				req.params.id,
				1,
				Number.MAX_SAFE_INTEGER
			);
			if (trackId === null) {
				return res.status(400).json({
					message: "Invalid track ID: must be a positive integer",
				});
			}
			const settings = req.body;

			// Generate job ID using centralized utility
			const jobId = InputSanitizer.generateJobId();

			// Retrieve the actual file path for the track from the database
			let originalPath: string;
			try {
				originalPath = await getTrackFilePath(trackId);
			} catch (error) {
				return res.status(404).json({
					message: `Track with ID ${trackId} not found`,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}

			const jobData = {
				jobId,
				trackId,
				originalPath, // Use the actual file path
				outputPath: path.join("results", `track-${trackId}-extended.mp3`),
				settings,
				userId: 1, // Placeholder
				priority: settings.priority || 2,
				useOptimization: settings.useOptimization || false,
			};

			const resultJobId = await jobQueueManager.addAudioProcessingJob(jobData);

			res.json({
				message: "Audio processing job queued successfully",
				jobId: resultJobId,
				trackId,
				status: "queued",
				estimatedProcessingTime: "2-5 minutes",
			});
		} catch (error) {
			console.error("Error queuing job:", error);
			res.status(500).json({ error: "Failed to queue processing job" });
		}
	});

	app.get("/api/jobs/:jobId/status", async (req, res) => {
		try {
			const jobId = req.params.jobId;
			const status = await jobQueueManager.getJobStatus(jobId);
			res.json(status);
		} catch (error) {
			console.error("Error getting job status:", error);
			res.status(500).json({ error: "Failed to get job status" });
		}
	});

	app.delete("/api/jobs/:jobId", async (req, res) => {
		try {
			const jobId = req.params.jobId;
			const cancelled = await jobQueueManager.cancelJob(jobId);
			res.json({
				message: cancelled
					? "Job cancelled successfully"
					: "Job not found or not cancellable",
				jobId,
				cancelled,
			});
		} catch (error) {
			console.error("Error cancelling job:", error);
			res.status(500).json({ error: "Failed to cancel job" });
		}
	});

	// Define interface for HTTP errors with status codes
	interface HttpError extends Error {
		status?: number;
		statusCode?: number;
	}

	app.use(
		(err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
			const status = err.status || err.statusCode || 500;
			const message = err.message || "Internal Server Error";

			res.status(status).json({ message });
			throw err;
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
			log("Server running in simple mode (no Redis required)");
			log("Job queue active with direct processing");
		}
	);

	// Graceful shutdown handling
	process.on("SIGTERM", async () => {
		log("SIGTERM received, shutting down gracefully...");

		try {
			await jobQueueManager.shutdown();
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
			await jobQueueManager.shutdown();
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
