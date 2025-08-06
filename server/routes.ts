/** @format */

import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { processingSettingsSchema } from "@shared/schema";
import { logger } from "../shared/logger";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { PythonShell } from "python-shell";
import { SecurePathValidator, InputSanitizer } from "./security-utils.js";
import crypto from "crypto";

// Setup multer for file uploads with proper validation
const uploadsDir =
	process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
const resultDir =
	process.env.RESULTS_DIR || path.join(process.cwd(), "results");

// Configuration constants
const MAX_VERSION_LIMIT = parseInt(process.env.MAX_VERSION_LIMIT || "3", 10);
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "15728640", 10); // 15MB default

// Initialize security components
const allowedDirectories = [uploadsDir, resultDir];
const secureValidator = new SecurePathValidator(allowedDirectories);
// TODO: Apply security middleware to routes when needed

// Security: Validate and canonicalize directory paths to prevent malicious paths
let normalizedUploadsDir: string;
let normalizedResultDir: string;

try {
	normalizedUploadsDir = validateAndCanonicalizeDirectory(uploadsDir);
	normalizedResultDir = validateAndCanonicalizeDirectory(resultDir);
} catch (error) {
	logger.error(
		"Directory validation failed during startup",
		error instanceof Error ? error : new Error(String(error))
	);
	throw error;
}

// Initialize directories asynchronously
async function ensureDirectoriesExist(): Promise<void> {
	try {
		await fsPromises.mkdir(normalizedUploadsDir, { recursive: true });
		await fsPromises.mkdir(normalizedResultDir, { recursive: true });
		logger.info("Directories initialized successfully", {
			uploadsDir: normalizedUploadsDir,
			resultDir: normalizedResultDir,
		});
	} catch (error) {
		logger.error(
			"Failed to create directories",
			error instanceof Error ? error : new Error(String(error))
		);
		throw error;
	}
}

// Enhanced security function to validate and canonicalize directory paths
function validateAndCanonicalizeDirectory(dirPath: string): string {
	try {
		// Canonicalize the directory path
		const canonicalPath = path.resolve(dirPath);

		// Additional validation for directory paths
		if (canonicalPath.includes("..") || canonicalPath.includes("~")) {
			throw new Error(`Invalid directory path: ${dirPath}`);
		}

		return canonicalPath;
	} catch {
		throw new Error(`Failed to validate directory path: ${dirPath}`);
	}
}

// Security function to validate file operations with canonicalized paths
function secureFileOperation(
	filePath: string,
	baseDirectory: string,
	operation: string
): boolean {
	try {
		// Canonicalize both paths
		const canonicalFilePath = path.resolve(filePath);
		const canonicalBaseDir = path.resolve(baseDirectory);

		// Verify the file is within the base directory
		const isWithinBase =
			canonicalFilePath.startsWith(canonicalBaseDir + path.sep) ||
			canonicalFilePath === canonicalBaseDir;

		if (!isWithinBase) {
			logger.securityWarning(`${operation} attempted outside base directory`, {
				filePath: canonicalFilePath,
				baseDirectory: canonicalBaseDir,
				operation,
			});
			return false;
		}

		return true;
	} catch (error) {
		logger.error(
			`Security check failed for ${operation}`,
			error instanceof Error ? error : new Error(String(error))
		);
		return false;
	}
}

const storage_config = multer.diskStorage({
	// skipcq: JS-0240
	destination: function (req, file, cb) {
		cb(null, normalizedUploadsDir);
	},
	// skipcq: JS-0240
	filename: function (req, file, cb) {
		// skipcq: JS-0246
		const uniqueSuffix =
			Date.now() + "-" + crypto.randomBytes(16).toString("hex");
		const sanitizedOriginalName = secureValidator.sanitizeFilename(
			file.originalname
		);
		const extension = path.extname(sanitizedOriginalName).toLowerCase();
		const allowedExtensions = [".mp3", ".wav", ".flac", ".aiff"];
		if (!allowedExtensions.includes(extension)) {
			return cb(
				new Error(
					"Invalid file extension. Only MP3, WAV, FLAC, and AIFF files are allowed."
				),
				""
			);
		}
		cb(null, uniqueSuffix + extension);
	},
});

const upload = multer({
	storage: storage_config,
	limits: {
		fileSize: MAX_FILE_SIZE,
	},
	fileFilter: (req, file, cb) => {
		const allowedMimeTypes = [
			"audio/mpeg",
			"audio/wav",
			"audio/flac",
			"audio/aiff",
			"audio/x-aiff",
		];
		if (allowedMimeTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(
				new Error(
					"Invalid file type. Only MP3, WAV, FLAC, and AIFF files are allowed."
				)
			);
		}
	},
});

export async function registerRoutes(app: Express): Promise<Server> {
	const httpServer = createServer(app);

	// Initialize directories
	await ensureDirectoriesExist();

	// Set up user for demo purposes
	let demoUser = await storage.getUserByUsername("demo");
	if (!demoUser) {
		demoUser = await storage.createUser({
			username: "demo",
			password: "password", // In a real app, this would be hashed
		});
	}

	/**
	 * Route Handlers Documentation
	 *
	 * POST /api/tracks/upload
	 * - Handles audio file upload
	 * - Creates track entry in database
	 * - Analyzes audio for basic info (format, tempo, key)
	 *
	 * GET /api/tracks/:id
	 * - Retrieves specific track information
	 *
	 * GET /api/tracks
	 * - Lists all tracks for demo user
	 *
	 * DELETE /api/tracks
	 * - Clears all tracks and associated files
	 *
	 * POST /api/tracks/:id/process
	 * - Processes track to create extended version
	 * - Handles versioning and status updates
	 *
	 * GET /api/tracks/:id/status
	 * - Returns current processing status
	 *
	 * GET /api/audio/:id/:type
	 * - Streams audio files (original or extended)
	 *
	 * GET /api/tracks/:id/download
	 * - Handles download of processed tracks
	 */

	// Upload audio file
	app.post(
		"/api/tracks/upload",
		upload.single("audio"),
		async (req: Request, res: Response) => {
			try {
				if (!req.file) {
					return res.status(400).json({ message: "No file uploaded" });
				}

				// Security: Validate uploaded file path
				if (
					!secureValidator.validateFilePath(req.file.path, normalizedUploadsDir)
				) {
					// Clean up the invalid file asynchronously
					try {
						await fsPromises.unlink(req.file.path);
						logger.info("Cleaned up invalid uploaded file", {
							filePath: req.file.path,
						});
					} catch (cleanupError) {
						// Extract error details with proper typing for better debugging
						const nodeError = cleanupError as NodeJS.ErrnoException;
						const errorDetails =
							cleanupError instanceof Error
								? {
										message: cleanupError.message,
										code: nodeError.code || "UNKNOWN",
										errno: nodeError.errno || "N/A",
								  }
								: {
										message: String(cleanupError),
										code: "UNKNOWN",
										errno: "N/A",
								  };

						logger.warn("Failed to cleanup invalid uploaded file", {
							operation: "invalid_file_cleanup",
							filePath: req.file.path,
							errorCode: errorDetails.code,
							errorNumber: errorDetails.errno,
							errorMessage: errorDetails.message,
							context: "upload_validation_cleanup",
						});
					}
					return res
						.status(403)
						.json({ message: "Access denied: Invalid file path" });
				}

				const track = await storage.createAudioTrack({
					originalFilename: req.file.originalname,
					originalPath: req.file.path,
					userId: demoUser.id, // Using demo user for now
				});

				// Get basic audio info using Python
				const options = {
					mode: "text" as const,
					pythonPath: process.platform === "win32" ? "python" : "python3",
					pythonOptions: ["-u"],
					scriptPath: path.join(process.cwd(), "server"),
					args: [req.file.path],
				};

				PythonShell.run("utils.py", options)
					.then(async (results) => {
						if (results && results.length > 0) {
							try {
								const audioInfo = JSON.parse(results[0]);
								await storage.updateAudioTrack(track.id, {
									format: audioInfo.format,
									bitrate: audioInfo.bitrate || null,
									duration: audioInfo.duration || null,
									bpm: audioInfo.bpm || null,
									key: audioInfo.key || null,
								});
							} catch (e) {
								console.error("Error parsing audio info:", e);
							}
						}
					})
					.catch((err) => {
						logger.error(
							"Error analyzing audio metadata",
							err instanceof Error ? err : new Error(String(err))
						);
					});

				return res.status(201).json(track);
			} catch (error) {
				logger.uploadError(
					"File upload failed",
					error instanceof Error ? error : new Error(String(error))
				);
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				return res
					.status(500)
					.json({ message: "Error uploading file", error: errorMessage });
			}
		}
	);

	// Get a specific track
	app.get("/api/tracks/:id", async (req: Request, res: Response) => {
		try {
			// Enhanced security: Validate and sanitize ID parameter
			const id = InputSanitizer.sanitizeIntParam(
				req.params.id,
				1,
				Number.MAX_SAFE_INTEGER
			);
			if (id === null) {
				return res.status(400).json({
					message: "Invalid track ID: must be a positive integer",
				});
			}

			const track = await storage.getAudioTrack(id);
			if (!track) {
				return res.status(404).json({ message: "Track not found" });
			}

			return res.json(track);
		} catch (error) {
			logger.apiError(
				"/api/tracks/:id",
				error instanceof Error ? error : new Error(String(error))
			);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return res
				.status(500)
				.json({ message: "Error retrieving track", error: errorMessage });
		}
	});

	// Get all tracks for the demo user
	app.get("/api/tracks", async (req: Request, res: Response) => {
		try {
			const tracks = await storage.getAudioTracksByUserId(demoUser.id);
			return res.json(tracks);
		} catch (error) {
			console.error("Get tracks error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return res
				.status(500)
				.json({ message: "Error retrieving tracks", error: errorMessage });
		}
	});

	// Clear all tracks
	app.delete("/api/tracks", async (req: Request, res: Response) => {
		try {
			const tracks = await storage.getAudioTracksByUserId(demoUser.id);

			// Delete files with enhanced security validation
			for (const track of tracks) {
				// Validate and delete original file asynchronously
				if (
					track.originalPath &&
					secureFileOperation(
						track.originalPath,
						normalizedUploadsDir,
						"delete"
					)
				) {
					try {
						await fsPromises.unlink(track.originalPath);
						logger.info("Deleted original file", {
							filePath: track.originalPath,
						});
					} catch (error) {
						logger.warn("Failed to delete original file", {
							filePath: track.originalPath,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				// Validate and delete extended files asynchronously
				if (track.extendedPaths && Array.isArray(track.extendedPaths)) {
					for (const filePath of track.extendedPaths) {
						if (secureFileOperation(filePath, normalizedResultDir, "delete")) {
							try {
								await fsPromises.unlink(filePath);
								logger.info("Deleted extended file", { filePath });
							} catch (error) {
								logger.warn("Failed to delete extended file", {
									filePath,
									error: error instanceof Error ? error.message : String(error),
								});
							}
						}
					}
				}
			}

			// Delete from database
			await storage.deleteAllUserTracks(demoUser.id);

			return res.json({ message: "All tracks cleared" });
		} catch (error) {
			console.error("Clear tracks error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return res
				.status(500)
				.json({ message: "Error clearing tracks", error: errorMessage });
		}
	});

	// Process a track to create extended version
	// skipcq: JS-0045
	app.post("/api/tracks/:id/process", async (req: Request, res: Response) => {
		try {
			// Enhanced security: Validate and sanitize ID parameter
			const id = InputSanitizer.sanitizeIntParam(
				req.params.id,
				1,
				Number.MAX_SAFE_INTEGER
			);
			if (id === null) {
				return res.status(400).json({
					message: "Invalid track ID: must be a positive integer",
				});
			}

			const track = await storage.getAudioTrack(id);
			if (!track) {
				return res.status(404).json({ message: "Track not found" });
			}

			// Check version limit

			if (track.versionCount > MAX_VERSION_LIMIT) {
				return res.status(400).json({
					message: `Maximum version limit (${MAX_VERSION_LIMIT}) reached`,
				});
			}

			// Validate settings from request
			const settings = processingSettingsSchema.parse(req.body);

			// Update track status and settings
			await storage.updateAudioTrack(id, {
				status: (track.extendedPaths as string[])?.length
					? "regenerate"
					: "processing",
				settings: settings, // skipcq: JS-0240
			});

			// Generate a filename for the extended version with security validation
			const outputBase = path.basename(
				track.originalFilename,
				path.extname(track.originalFilename)
			);
			const fileExt = path.extname(track.originalFilename);
			const version = (track.extendedPaths as string[])?.length || 0;
			const sanitizedBaseName = secureValidator.sanitizeFilename(outputBase);
			const outputFilename = `${sanitizedBaseName}_extended_v${
				version + 1
			}${fileExt}`;
			const outputPath = path.join(normalizedResultDir, outputFilename);
			// Security: Validate the generated output path is within the results directory
			if (!secureValidator.validateFilePath(outputPath, normalizedResultDir)) {
				return res.status(500).json({
					message: "Error: Generated output path is invalid",
				});
			}

			// Execute the Python script for audio processing
			const options = {
				mode: "text" as const,
				pythonPath: process.platform === "win32" ? "python" : "python3",
				pythonOptions: ["-u"],
				scriptPath: path.join(process.cwd(), "server"),
				args: [
					track.originalPath,
					outputPath,
					settings.introLength.toString(),
					settings.outroLength.toString(),
					settings.preserveVocals.toString(),
					settings.beatDetection,
				],
			};

			// Send initial response
			res.status(202).json({
				message: "Processing started",
				trackId: id,
				status: "processing",
			});

			// Start processing in background
			PythonShell.run("audioProcessor.py", options)
				.then(async (results) => {
					console.log("Processing complete:", results);

					// Get audio info of the processed file
					const audioInfoOptions = {
						mode: "text" as const,
						pythonPath: process.platform === "win32" ? "python" : "python3",
						pythonOptions: ["-u"],
						scriptPath: path.join(process.cwd(), "server"),
						args: [outputPath],
					};

					return PythonShell.run("utils.py", audioInfoOptions).then(
						async (infoResults) => {
							let extendedDuration = null;

							if (infoResults && infoResults.length > 0) {
								try {
									const audioInfo = JSON.parse(infoResults[0]);
									console.log("Extended audio info:", audioInfo);
									extendedDuration = audioInfo.duration || null;
								} catch (e) {
									console.error("Error parsing extended audio info:", e);
								}
							}

							// Update track with completed status and add new version
							const track = await storage.getAudioTrack(id);
							if (!track) {
								throw new Error("Track not found during completion update");
							}
							const currentPaths = (track.extendedPaths as string[]) || [];
							const currentDurations =
								(track.extendedDurations as number[]) || [];
							const extendedPaths = [...currentPaths, outputPath];
							console.log("extendedPaths:", extendedPaths);

							return storage.updateAudioTrack(id, {
								status: "completed",
								extendedPaths: extendedPaths, // skipcq: JS-0240
								extendedDurations: [...currentDurations, extendedDuration],
								versionCount: (track.versionCount || 1) + 1,
							});
						}
					);
				})
				.catch(async (error) => {
					console.error("Processing error:", error);
					await storage.updateAudioTrack(id, {
						status: "error",
					});
				});
		} catch (error) {
			console.error("Process track error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return res
				.status(500)
				.json({ message: "Error processing track", error: errorMessage });
		}
	});

	// Get processing status
	app.get("/api/tracks/:id/status", async (req: Request, res: Response) => {
		try {
			// Enhanced security: Validate and sanitize ID parameter
			const id = InputSanitizer.sanitizeIntParam(
				req.params.id,
				1,
				Number.MAX_SAFE_INTEGER
			);
			if (id === null) {
				return res.status(400).json({
					message: "Invalid track ID: must be a positive integer",
				});
			}

			const track = await storage.getAudioTrack(id);
			if (!track) {
				return res.status(404).json({ message: "Track not found" });
			}

			return res.json({ status: track.status });
		} catch (error) {
			console.error("Get status error:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			return res
				.status(500)
				.json({ message: "Error retrieving status", error: errorMessage });
		}
	});

	// Serve audio files
	// skipcq: JS-0045
	app.get("/api/audio/:id/:type", async (req: Request, res: Response) => {
		try {
			// Enhanced security: Validate and sanitize ID parameter
			const id = InputSanitizer.sanitizeIntParam(
				req.params.id,
				1,
				Number.MAX_SAFE_INTEGER
			);
			if (id === null) {
				return res.status(400).json({
					message: "Invalid track ID: must be a positive integer",
				});
			}

			// Enhanced security: Validate and sanitize type parameter
			const type = InputSanitizer.sanitizeStringParam(req.params.type, [
				"original",
				"extended",
			]);
			if (!type) {
				return res.status(400).json({ message: "Invalid audio type" });
			}

			const track = await storage.getAudioTrack(id);
			if (!track) {
				return res.status(404).json({ message: "Track not found" });
			}

			let filePath = track.originalPath;
			if (type === "extended") {
				// Enhanced security: Validate version parameter
				const version =
					InputSanitizer.sanitizeIntParam(
						req.query.version as string,
						0,
						100
					) || 0;
				const extendedPaths = Array.isArray(track.extendedPaths)
					? track.extendedPaths
					: [];
				filePath = extendedPaths[version];
			}

			if (!filePath) {
				return res
					.status(404)
					.json({ message: `${type} audio file not found` });
			}

			// Enhanced security: Comprehensive file path validation
			const pathValidation = secureValidator.validatePath(filePath, "read");
			if (!pathValidation.isValid) {
				console.warn("Path validation failed:", pathValidation.errors);
				return res.status(403).json({
					message: "Access denied: Invalid file path",
					errors: pathValidation.errors,
				});
			}

			// Security: Validate file path contains only safe characters and extensions
			const allowedExtensions = [".mp3", ".wav", ".flac", ".aiff"];
			if (!secureValidator.validateFileExtension(filePath, allowedExtensions)) {
				return res.status(400).json({ message: "Invalid file type" });
			}

			// Security: Enhanced path validation with canonicalization
			const isUploadFile =
				secureValidator.validateFilePath(filePath, normalizedUploadsDir) &&
				secureFileOperation(filePath, normalizedUploadsDir, "read");
			const isResultFile =
				secureValidator.validateFilePath(filePath, normalizedResultDir) &&
				secureFileOperation(filePath, normalizedResultDir, "read");

			if (!isUploadFile && !isResultFile) {
				return res
					.status(403)
					.json({ message: "Access denied: Invalid file path" });
			}

			// Check if file exists and get stats asynchronously
			let stat;
			try {
				stat = await fsPromises.stat(filePath);
			} catch (statError) {
				logger.warn("Failed to access audio file", {
					filePath,
					error:
						statError instanceof Error ? statError.message : String(statError),
				});
				return res
					.status(404)
					.json({ message: "Audio file not found on disk" });
			}

			const fileSize = stat.size;
			const range = req.headers.range;

			if (range) {
				const parts = range.replace(/bytes=/, "").split("-");
				const start = parseInt(parts[0], 10);
				const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
				const chunksize = end - start + 1;
				const file = fs.createReadStream(filePath, { start, end });
				const head = {
					"Content-Range": `bytes ${start}-${end}/${fileSize}`,
					"Accept-Ranges": "bytes",
					"Content-Length": chunksize,
					"Content-Type": "audio/mpeg",
				};
				res.writeHead(206, head);
				file.pipe(res);
			} else {
				const head = {
					"Content-Length": fileSize,
					"Content-Type": "audio/mpeg",
				};
				res.writeHead(200, head);
				fs.createReadStream(filePath).pipe(res);
			}
		} catch (error) {
			console.error("Stream audio error:", error);
			return res.status(500).json({
				message: "Error streaming audio",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	// Download extended audio
	// skipcq: JS-0045
	app.get("/api/tracks/:id/download", async (req: Request, res: Response) => {
		try {
			// Enhanced security: Validate and sanitize ID parameter
			const id = InputSanitizer.sanitizeIntParam(
				req.params.id,
				1,
				Number.MAX_SAFE_INTEGER
			);
			if (id === null) {
				return res.status(400).json({
					message: "Invalid track ID: must be a positive integer",
				});
			}

			const track = await storage.getAudioTrack(id);
			if (!track) {
				return res.status(404).json({ message: "Track not found" });
			}

			// Enhanced security: Validate version parameter
			const version =
				InputSanitizer.sanitizeIntParam(req.query.version as string, 0, 100) ||
				0;
			const extendedPaths = Array.isArray(track.extendedPaths)
				? track.extendedPaths
				: [];

			if (version >= extendedPaths.length || !extendedPaths[version]) {
				return res.status(404).json({ message: "Extended version not found" });
			}

			const filePath = extendedPaths[version];

			// Security: Validate file path contains only safe characters and extensions
			const allowedExtensions = [".mp3", ".wav", ".flac", ".aiff"];
			const fileExtension = path.extname(filePath).toLowerCase();
			if (!allowedExtensions.includes(fileExtension)) {
				return res.status(400).json({ message: "Invalid file type" });
			}

			// Security: Enhanced path validation with canonicalization
			if (
				!secureValidator.validateFilePath(filePath, normalizedResultDir) ||
				!secureFileOperation(filePath, normalizedResultDir, "download")
			) {
				return res
					.status(403)
					.json({ message: "Access denied: Invalid file path" });
			}

			// Check if extended file exists asynchronously
			try {
				await fsPromises.access(filePath);
			} catch (accessError) {
				logger.warn("Extended audio file not accessible", {
					filePath,
					error:
						accessError instanceof Error
							? accessError.message
							: String(accessError),
				});
				return res
					.status(404)
					.json({ message: "Extended audio file not found on disk" });
			}

			// Extract original filename without extension
			const originalNameWithoutExt = path.basename(
				track.originalFilename,
				path.extname(track.originalFilename)
			);

			// Create download filename with version number
			const downloadFilenameRaw = `${originalNameWithoutExt}_extended_v${
				version + 1
			}${path.extname(track.originalFilename)}`;
			// Sanitize the download filename to prevent path traversal and unsafe characters
			const downloadFilename =
				secureValidator.sanitizeFilename(downloadFilenameRaw);

			res.download(filePath, downloadFilename);
		} catch (error) {
			console.error("Download error:", error);
			return res.status(500).json({
				message: "Error downloading file",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});

	return httpServer;
}
