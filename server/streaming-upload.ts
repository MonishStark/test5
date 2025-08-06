/**
 * Streaming Upload Handler for Large Audio Files
 *
 * This module implements streaming file uploads with the following features:
 * - Memory-efficient processing of large audio files (up to 500MB)
 * - Real-time progress tracking and validation
 * - Chunk-based processing with automatic cleanup
 * - Support for multiple audio formats (MP3, WAV, FLAC, AIFF, M4A)
 * - Comprehensive error handling and recovery
 * - Integration with existing Music DJ Feature infrastructure
 *
 * @format
 */

import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { createWriteStream, createReadStream, promises as fs } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import crypto from "crypto";
import { logger } from "../shared/logger";
import { PythonShell } from "python-shell";

// Types for streaming upload
interface StreamingUploadOptions {
	maxFileSize: number;
	allowedFormats: string[];
	uploadDirectory: string;
	chunkSize: number;
	enableCompression: boolean;
}

interface UploadProgress {
	uploadId: string;
	filename: string;
	bytesReceived: number;
	totalBytes: number;
	percentage: number;
	status: "uploading" | "processing" | "completed" | "error";
	error?: string;
	startTime: number;
	speed: number; // bytes per second
	estimatedTimeRemaining: number; // seconds
}

interface AudioMetadata {
	duration: number;
	bitrate: number;
	bpm: number;
	key: string;
	format: string;
}

interface StreamingUploadResult {
	uploadId: string;
	filename: string;
	filepath: string;
	size: number;
	mimetype: string;
	duration?: number;
	metadata?: AudioMetadata;
}

interface StorageError {
	operation: string;
	path?: string;
	message: string;
	code?: string;
	timestamp: number;
}

interface StreamingUploadError extends Error {
	code?: string;
	field?: string;
	storageErrors?: StorageError[];
}

/**
 * Default configuration for streaming uploads
 * Optimized for audio files with reasonable limits
 */
const DEFAULT_OPTIONS: StreamingUploadOptions = {
	maxFileSize: 500 * 1024 * 1024, // 500MB maximum file size
	allowedFormats: [".mp3", ".wav", ".flac", ".aiff", ".m4a", ".ogg"],
	uploadDirectory: path.join(process.cwd(), "uploads", "temp"),
	chunkSize: 1024 * 1024, // 1MB chunks for optimal memory usage
	enableCompression: false, // Disable compression for audio files
};

/**
 * In-memory store for tracking upload progress
 * In production, consider using Redis or similar
 */
export const uploadProgress = new Map<string, UploadProgress>();

/**
 * Generate unique upload ID for tracking
 */
function generateUploadId(): string {
	return crypto.randomBytes(16).toString("hex");
}

/**
 * Validate file format based on extension and MIME type
 */
function validateFileFormat(
	filename: string,
	mimetype: string,
	allowedFormats: string[]
): boolean {
	const ext = path.extname(filename).toLowerCase();
	const validExtensions = allowedFormats.includes(ext);

	// Additional MIME type validation for security
	const validMimeTypes = [
		"audio/mpeg",
		"audio/mp3",
		"audio/wav",
		"audio/wave",
		"audio/flac",
		"audio/aiff",
		"audio/m4a",
		"audio/ogg",
	];
	const validMime = validMimeTypes.some((type) => mimetype.includes(type));

	return validExtensions && validMime;
}

/**
 * Ensure upload directory exists
 */
async function ensureUploadDirectory(uploadDir: string): Promise<void> {
	try {
		await fs.access(uploadDir);
	} catch {
		await fs.mkdir(uploadDir, { recursive: true });
	}
}

/**
 * Security function to validate file paths and prevent path traversal
 * Integrates with existing security functions from routes.ts
 */
function validateFilePath(filePath: string, allowedDirectory: string): boolean {
	try {
		const resolvedFilePath = path.resolve(filePath);
		const resolvedAllowedDir = path.resolve(allowedDirectory);
		const relative = path.relative(resolvedAllowedDir, resolvedFilePath);
		// If relative path starts with '..' or contains '..' segments, it's outside allowedDirectory
		if (
			relative.startsWith(".." + path.sep) ||
			relative === ".." ||
			relative.split(path.sep).includes("..")
		) {
			return false;
		}
		return true;
	} catch (error) {
		logger.error(
			"Path validation error",
			error instanceof Error ? error : new Error(String(error))
		);
		return false;
	}
}

/**
 * Sanitize filename to prevent security issues
 * Uses same logic as existing routes.ts
 */
function sanitizeFilename(filename: string): string {
	return filename
		.replace(/[<>:"/\\|?*\0]/g, "") // Remove filesystem-dangerous characters
		.replace(/\.\./g, "") // Remove path traversal attempts
		.replace(/^\.+/, "") // Remove leading dots
		.slice(0, 255); // Limit filename length
}

/**
 * Create streaming upload middleware with progress tracking
 */
export function createStreamingUploader(
	options: Partial<StreamingUploadOptions> = {}
) {
	const config = { ...DEFAULT_OPTIONS, ...options };

	// Configure multer for streaming uploads with higher limits
	const storage = multer.diskStorage({
		destination: async (req, file, cb) => {
			try {
				await ensureUploadDirectory(config.uploadDirectory);
				cb(null, config.uploadDirectory);
			} catch (error) {
				cb(error as Error, ""); // skipcq: JS-0255
			}
		},
		filename: (req, file, cb) => {
			// Generate unique filename to prevent conflicts
			const uploadId = generateUploadId();
			// skipcq: JS-0246
			const uniqueSuffix = crypto.randomUUID();
			const sanitizedName = sanitizeFilename(file.originalname);
			const ext = path.extname(sanitizedName);
			const filename = `${uploadId}_${uniqueSuffix}${ext}`;

			// Store upload metadata in request for later use
			req.uploadId = uploadId;
			req.uploadFilename = filename;

			cb(null, filename);
		},
	});

	const upload = multer({
		storage,
		limits: {
			fileSize: config.maxFileSize,
			files: 1, // Only allow single file uploads
		},
		fileFilter: (req, file, cb) => {
			if (
				validateFileFormat(
					file.originalname,
					file.mimetype,
					config.allowedFormats
				)
			) {
				cb(null, true);
			} else {
				cb(
					new Error(
						`Unsupported file format. Allowed formats: ${config.allowedFormats.join(
							", "
						)}`
					)
				);
			}
		},
	});

	return upload.single("audio");
}

/**
 * Middleware to track upload progress with enhanced metrics
 */
export function trackUploadProgress() {
	return (req: Request, res: Response, next: NextFunction) => {
		const uploadId = req.uploadId || generateUploadId();
		req.uploadId = uploadId;

		// Initialize progress tracking with comprehensive metrics
		const contentLength = parseInt(req.headers["content-length"] || "0", 10);
		const startTime = Date.now();

		uploadProgress.set(uploadId, {
			uploadId,
			filename: (req.headers["x-filename"] as string) || "unknown",
			bytesReceived: 0,
			totalBytes: contentLength,
			percentage: 0,
			status: "uploading",
			startTime,
			speed: 0,
			estimatedTimeRemaining: 0,
		});

		// Track bytes received with speed calculation
		let bytesReceived = 0;
		req.on("data", (chunk) => {
			bytesReceived += chunk.length;
			const currentTime = Date.now();
			const elapsedTime = (currentTime - startTime) / 1000; // seconds
			const speed = elapsedTime > 0 ? bytesReceived / elapsedTime : 0;
			const remainingBytes = contentLength - bytesReceived;
			const estimatedTimeRemaining = speed > 0 ? remainingBytes / speed : 0;

			const progress = uploadProgress.get(uploadId);
			if (progress) {
				progress.bytesReceived = bytesReceived;
				progress.percentage = Math.round((bytesReceived / contentLength) * 100);
				progress.speed = speed;
				progress.estimatedTimeRemaining = estimatedTimeRemaining;
				uploadProgress.set(uploadId, progress);
			}
		});

		req.on("end", () => {
			const progress = uploadProgress.get(uploadId);
			if (progress) {
				progress.status = "processing";
				uploadProgress.set(uploadId, progress);
			}
		});

		next();
	};
}

/**
 * Get upload progress by ID
 */
export function getUploadProgress(uploadId: string): UploadProgress | null {
	return uploadProgress.get(uploadId) || null;
}

/**
 * Update upload progress status
 */
export function updateUploadProgress(
	uploadId: string,
	updates: Partial<UploadProgress>
): void {
	const current = uploadProgress.get(uploadId);
	if (current) {
		uploadProgress.set(uploadId, { ...current, ...updates });
	}
}

/**
 * Clean up upload progress tracking
 */
export function cleanupUploadProgress(uploadId: string): void {
	uploadProgress.delete(uploadId);
}

/**
 * Stream-based file processing for audio analysis
 * Integrates with existing Python audio processing pipeline
 */
export class AudioFileStreamProcessor {
	private chunkSize: number;
	private tempDirectory: string;

	constructor(chunkSize = 1024 * 1024, tempDirectory = "uploads/temp") {
		this.chunkSize = chunkSize;
		this.tempDirectory = tempDirectory;
	}

	/**
	 * Process audio file in streaming chunks for memory efficiency
	 * Integrates with existing audio analysis from utils.py
	 */
	async processAudioFile(
		filePath: string,
		uploadId: string
	): Promise<StreamingUploadResult> {
		try {
			updateUploadProgress(uploadId, { status: "processing" });

			// Validate file path for security
			const normalizedUploadsDir = path.resolve(process.cwd(), "uploads");
			if (!validateFilePath(filePath, normalizedUploadsDir)) {
				throw new Error("Invalid file path");
			}

			const stats = await fs.stat(filePath);
			const filename = path.basename(filePath);
			const ext = path.extname(filePath);

			// Basic file information
			const result: StreamingUploadResult = {
				uploadId,
				filename,
				filepath: filePath,
				size: stats.size,
				mimetype: this.getMimeType(ext),
			};

			// Stream-based metadata extraction using existing Python analysis
			const metadata = await this.extractMetadataStreaming(filePath);
			result.metadata = metadata;
			result.duration = metadata.duration;

			updateUploadProgress(uploadId, {
				status: "completed",
				percentage: 100,
			});

			return result;
		} catch (error) {
			updateUploadProgress(uploadId, {
				status: "error",
				error: error instanceof Error ? error.message : "Unknown error",
			});
			throw error;
		}
	}

	/**
	 * Extract metadata using existing Python analysis pipeline
	 * Integrates with utils.py for consistent audio analysis
	 */
	// skipcq: JS-0105
	private async extractMetadataStreaming(
		filePath: string
	): Promise<AudioMetadata> {
		return new Promise((resolve, reject) => {
			const options = {
				mode: "text" as const,
				pythonPath: process.platform === "win32" ? "python" : "python3",
				pythonOptions: ["-u"],
				scriptPath: path.join(process.cwd(), "server"),
				args: [filePath],
			};

			PythonShell.run("utils.py", options)
				.then((results: string[]) => {
					if (results && results.length > 0) {
						try {
							const audioInfo = JSON.parse(results[0]);
							resolve({
								duration: audioInfo.duration || 0,
								bitrate: audioInfo.bitrate || 0,
								bpm: audioInfo.bpm || 0,
								key: audioInfo.key || "Unknown",
								format: audioInfo.format || "unknown",
							});
						} catch (e) {
							logger.error(
								"Error parsing audio info",
								e instanceof Error ? e : new Error(String(e))
							);
							resolve({
								duration: 0,
								bitrate: 0,
								bpm: 0,
								key: "Unknown",
								format: "unknown",
							});
						}
					} else {
						resolve({
							duration: 0,
							bitrate: 0,
							bpm: 0,
							key: "Unknown",
							format: "unknown",
						});
					}
				})
				.catch((error: Error) => {
					logger.error("Python analysis error", error);
					reject(error);
				});
		});
	}

	/**
	 * Get MIME type from file extension
	 */
	// skipcq: JS-0105
	private getMimeType(ext: string): string {
		const mimeTypes: Record<string, string> = {
			".mp3": "audio/mpeg",
			".wav": "audio/wav",
			".flac": "audio/flac",
			".aiff": "audio/aiff",
			".m4a": "audio/m4a",
			".ogg": "audio/ogg",
		};
		return mimeTypes[ext.toLowerCase()] || "audio/unknown";
	}

	/**
	 * Stream file to destination with progress tracking
	 */
	async streamFile(
		source: string,
		destination: string,
		uploadId: string
	): Promise<void> {
		const sourceStream = createReadStream(source, {
			highWaterMark: this.chunkSize,
		});
		const destStream = createWriteStream(destination);

		let bytesStreamed = 0;
		const stats = await fs.stat(source);
		const totalBytes = stats.size;

		sourceStream.on("data", (chunk) => {
			bytesStreamed += chunk.length;
			const percentage = Math.round((bytesStreamed / totalBytes) * 100);
			updateUploadProgress(uploadId, {
				bytesReceived: bytesStreamed,
				percentage,
			});
		});

		await pipeline(sourceStream, destStream);
	}

	/**
	 * Clean up temporary files
	 */
	// skipcq: JS-0105
	async cleanup(filePath: string): Promise<void> {
		try {
			await fs.unlink(filePath);
		} catch (error) {
			// nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
			logger.warn("Failed to cleanup file", {
				filePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

/**
 * Enhanced error handling for streaming uploads
 */
export function handleStreamingErrors() {
	return (
		error: StreamingUploadError,
		req: Request,
		res: Response,
		_next: NextFunction
		// skipcq: JS-0045
	) => {
		const uploadId = req.uploadId;

		if (uploadId) {
			updateUploadProgress(uploadId, {
				status: "error",
				error: error.message || "Upload failed",
			});
		}

		// Handle specific multer errors
		if (error instanceof multer.MulterError) {
			switch (error.code) {
				case "LIMIT_FILE_SIZE":
					return res.status(413).json({
						error: "File too large",
						message: "Maximum file size is 500MB",
						uploadId,
					});
				case "LIMIT_FILE_COUNT":
					return res.status(400).json({
						error: "Too many files",
						message: "Only one file allowed per upload",
						uploadId,
					});
				case "LIMIT_UNEXPECTED_FILE":
					return res.status(400).json({
						error: "Unexpected file",
						message: 'File field name must be "audio"',
						uploadId,
					});
				default:
					return res.status(400).json({
						error: "Upload error",
						message: error.message,
						uploadId,
					});
			}
		}

		// Handle validation errors
		if (error.message.includes("Unsupported file format")) {
			return res.status(400).json({
				error: "Invalid file format",
				message: error.message,
				uploadId,
			});
		}

		// Generic error response
		res.status(500).json({
			error: "Server error",
			message: "An unexpected error occurred during upload",
			uploadId,
		});
	};
}

// Type augmentation for Express Request
declare global {
	// skipcq: JS-0337
	namespace Express {
		interface Request {
			uploadId?: string;
			uploadFilename?: string;
		}
	}
}
