/**
 * Streaming Upload API Routes
 *
 * Provides endpoints for:
 * - Initiating streaming uploads with progress tracking
 * - Monitoring upload progress in real-time
 * - Processing large audio files efficiently
 * - Managing upload lifecycle and cleanup
 * - Integration with existing Music DJ Feature infrastructure
 *
 * @format
 */

import { Router, Request, Response } from "express";
import path from "path";
import crypto from "crypto";
import { promises as fs } from "fs";
import {
	createStreamingUploader,
	trackUploadProgress,
	getUploadProgress,
	updateUploadProgress,
	cleanupUploadProgress,
	handleStreamingErrors,
	AudioFileStreamProcessor,
	uploadProgress,
} from "./streaming-upload.js";
import { storage } from "./storage.js";

// Interface for active upload summary
interface ActiveUploadSummary {
	uploadId: string;
	filename: string;
	percentage: number;
	status: "uploading" | "processing";
	bytesReceived: number;
	totalBytes: number;
	speed: number;
	estimatedTimeRemaining: number;
}

const router = Router();
const streamProcessor = new AudioFileStreamProcessor();

// Get normalized directories (same as routes.ts)
const normalizedUploadsDir = path.resolve(process.cwd(), "uploads");
const normalizedResultDir = path.resolve(process.cwd(), "results");

/**
 * Initialize streaming upload session
 * POST /api/streaming/upload/init
 *
 * Prepares the server for a streaming upload and returns upload ID
 */
// skipcq: JS-0045
router.post("/upload/init", async (req: Request, res: Response) => {
	try {
		const { filename, fileSize } = req.body;

		// Validate input
		if (!filename || !fileSize) {
			return res.status(400).json({
				error: "Missing required fields",
				message: "filename and fileSize are required",
			});
		}

		// Check file size limit (500MB)
		const maxSize = 500 * 1024 * 1024;
		if (fileSize > maxSize) {
			return res.status(413).json({
				error: "File too large",
				message: `Maximum file size is ${Math.round(
					maxSize / (1024 * 1024)
				)}MB`,
			});
		}

		// Validate file format
		const allowedExtensions = [
			".mp3",
			".wav",
			".flac",
			".aiff",
			".m4a",
			".ogg",
		];
		const ext = path.extname(filename).toLowerCase();
		if (!allowedExtensions.includes(ext)) {
			return res.status(400).json({
				error: "Unsupported format",
				message: `Allowed formats: ${allowedExtensions.join(", ")}`,
			});
		}

		// Generate upload session
		const uploadId = crypto.randomBytes(16).toString("hex");

		// Initialize progress tracking
		updateUploadProgress(uploadId, {
			uploadId,
			filename,
			bytesReceived: 0,
			totalBytes: fileSize,
			percentage: 0,
			status: "uploading",
			startTime: Date.now(),
			speed: 0,
			estimatedTimeRemaining: 0,
		});

		res.json({
			uploadId,
			chunkSize: 1024 * 1024, // 1MB chunks
			maxFileSize: maxSize,
			message: "Upload session initialized",
		});
	} catch (error) {
		console.error("Upload init error:", error);
		res.status(500).json({
			error: "Server error",
			message: "Failed to initialize upload session",
		});
	}
});

/**
 * Enhanced streaming upload endpoint with database integration
 * POST /api/streaming/upload/stream
 *
 * Handles the actual file upload with real-time progress and database integration
 */
router.post(
	"/upload/stream",
	trackUploadProgress(),
	createStreamingUploader({
		maxFileSize: 500 * 1024 * 1024, // 500MB
		uploadDirectory: normalizedUploadsDir,
		chunkSize: 1024 * 1024, // 1MB chunks
	}),
	// skipcq: JS-0045
	async (req: Request, res: Response) => {
		try {
			const uploadId = req.uploadId;
			const file = req.file;

			// Validate uploadId is provided by middleware
			if (!uploadId) {
				return res.status(400).json({
					error: "Missing upload ID",
					message: "Upload ID is required for streaming upload",
				});
			}

			if (!file) {
				return res.status(400).json({
					error: "No file uploaded",
					message: "Please select an audio file to upload",
					uploadId,
				});
			}

			// Update progress to processing state
			updateUploadProgress(uploadId, {
				status: "processing",
				percentage: 100,
			});

			// Get demo user (same as existing routes.ts)
			let demoUser = await storage.getUserByUsername("demo");
			if (!demoUser) {
				demoUser = await storage.createUser({
					username: "demo",
					password: "password",
				});
			}

			// Create database entry (integrate with existing storage)
			const track = await storage.createAudioTrack({
				originalFilename: file.originalname,
				originalPath: file.path,
				userId: demoUser.id,
			});

			// Process the uploaded file for metadata
			const result = await streamProcessor.processAudioFile(
				file.path,
				uploadId
			);

			// Update track with metadata (same as existing flow)
			if (result.metadata) {
				await storage.updateAudioTrack(track.id, {
					format: result.metadata.format,
					bitrate: result.metadata.bitrate || null,
					duration: result.metadata.duration || null,
					bpm: result.metadata.bpm || null,
					key: result.metadata.key || null,
				});
			}

			// Final progress update
			updateUploadProgress(uploadId, {
				status: "completed",
				percentage: 100,
			});

			// Return response in same format as existing upload endpoint
			res.status(201).json({
				...track,
				id: track.id,
				originalFilename: track.originalFilename,
				originalPath: track.originalPath,
				userId: track.userId,
				status: track.status,
				format: result.metadata?.format,
				bitrate: result.metadata?.bitrate,
				duration: result.metadata?.duration,
				bpm: result.metadata?.bpm,
				key: result.metadata?.key,
				uploadId,
				streaming: true, // Flag to indicate this was a streaming upload
				message: "Large file uploaded and processed successfully",
			});
		} catch (error) {
			console.error("Streaming upload error:", error);
			const uploadId = req.uploadId;

			if (uploadId) {
				updateUploadProgress(uploadId, {
					status: "error",
					error: error instanceof Error ? error.message : "Upload failed",
				});
			}

			res.status(500).json({
				error: "Upload failed",
				message: error instanceof Error ? error.message : "Unknown error",
				uploadId,
			});
		}
	}
);

/**
 * Get upload progress
 * GET /api/streaming/upload/progress/:uploadId
 *
 * Returns real-time progress information for an upload
 */
// skipcq: JS-0045
router.get("/upload/progress/:uploadId", (req: Request, res: Response) => {
	try {
		const { uploadId } = req.params;
		const progress = getUploadProgress(uploadId);

		if (!progress) {
			return res.status(404).json({
				error: "Upload not found",
				message: "No upload found with the specified ID",
			});
		}

		res.json({
			...progress,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("Progress check error:", error);
		res.status(500).json({
			error: "Server error",
			message: "Failed to retrieve upload progress",
		});
	}
});

/**
 * Cancel/cleanup upload
 * DELETE /api/streaming/upload/:uploadId
 *
 * Cancels an ongoing upload and cleans up resources
 */
// skipcq: JS-0045
router.delete("/upload/:uploadId", async (req: Request, res: Response) => {
	try {
		const { uploadId } = req.params;
		const progress = getUploadProgress(uploadId);

		if (!progress) {
			return res.status(404).json({
				error: "Upload not found",
				message: "No upload found with the specified ID",
			});
		}

		// Clean up any temporary files
		const tempPattern = path.join(normalizedUploadsDir, `${uploadId}_*`); // nosemgrep: javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal, javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal

		try {
			await streamProcessor.cleanup(tempPattern);
		} catch (error) {
			// Ignore cleanup errors as files might not exist
			console.warn("Cleanup warning:", error);
		}

		// Remove from progress tracking
		cleanupUploadProgress(uploadId);

		res.json({
			success: true,
			message: "Upload cancelled and cleaned up",
			uploadId,
		});
	} catch (error) {
		console.error("Upload cleanup error:", error);
		res.status(500).json({
			error: "Cleanup failed",
			message: "Failed to clean up upload resources",
		});
	}
});

/**
 * Get all active uploads (admin endpoint)
 * GET /api/streaming/upload/active
 *
 * Returns list of all currently active uploads
 */
router.get("/upload/active", (req: Request, res: Response) => {
	try {
		// In production, add authentication/authorization here
		const activeUploads: ActiveUploadSummary[] = [];

		// Get all active uploads (in production, this should be paginated)
		uploadProgress.forEach((progress, _uploadId) => {
			if (progress.status === "uploading" || progress.status === "processing") {
				activeUploads.push({
					uploadId: progress.uploadId,
					filename: progress.filename,
					percentage: progress.percentage,
					status: progress.status,
					bytesReceived: progress.bytesReceived,
					totalBytes: progress.totalBytes,
					speed: progress.speed,
					estimatedTimeRemaining: progress.estimatedTimeRemaining,
				});
			}
		});

		res.json({
			activeUploads,
			count: activeUploads.length,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("Active uploads error:", error);
		res.status(500).json({
			error: "Server error",
			message: "Failed to retrieve active uploads",
		});
	}
});

/**
 * Health check for streaming service
 * GET /api/streaming/health
 */
router.get("/health", async (req: Request, res: Response) => {
	try {
		const uploadsDir = normalizedUploadsDir;
		const tempDir = path.join(uploadsDir, "temp");
		// Audio directory available if needed: path.join(uploadsDir, "audio")

		// Check directory accessibility
		await fs.access(uploadsDir);

		res.json({
			status: "healthy",
			service: "streaming-upload",
			version: "1.0.0",
			integration: "music-dj-feature",
			directories: {
				uploads: uploadsDir,
				temp: tempDir,
				results: normalizedResultDir,
			},
			limits: {
				maxFileSize: "500MB",
				chunkSize: "1MB",
				allowedFormats: [".mp3", ".wav", ".flac", ".aiff", ".m4a", ".ogg"],
			},
			features: {
				databaseIntegration: true,
				metadataExtraction: true,
				progressTracking: true,
				errorRecovery: true,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		res.status(503).json({
			status: "unhealthy",
			error: error instanceof Error ? error.message : "Unknown error",
			timestamp: new Date().toISOString(),
		});
	}
});

// Apply error handling middleware
router.use(handleStreamingErrors());

export default router;
