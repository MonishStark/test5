/**
 * Security Utilities for Path Traversal Prevention
 *
 * This module provides comprehensive security utilities to prevent path traversal
 * vulnerabilities and ensure safe file operations throughout the application.
 *
 * @format
 */

import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { Request, Response, NextFunction } from "express";

/**
 * Enhanced path validation with multiple security layers
 */
export class SecurePathValidator {
	private readonly allowedDirectories: Set<string>;
	private readonly maxPathLength = 4096;
	private readonly blockedPatterns = [
		/\.\./g, // Directory traversal
		/~[/\\]/g, // Home directory references
		/\0/g, // Null byte injection
		/%00/g, // URL encoded null byte
		/%2e%2e/gi, // URL encoded ..
		/%2f/gi, // URL encoded /
		/%5c/gi, // URL encoded \
		/[<>"|*?]/g, // Filesystem dangerous characters
		/^[./\\]+/g, // Leading dots, slashes
		/CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]/gi, // Windows reserved names
	];

	constructor(allowedDirectories: string[]) {
		const validatedDirs = allowedDirectories.filter(
			SecurePathValidator.isSafeDirectory
		);
		this.allowedDirectories = new Set(
			validatedDirs.map((dir) => path.resolve(dir))
		);
		if (validatedDirs.length !== allowedDirectories.length) {
			throw new Error(
				"One or more allowedDirectories entries are invalid or unsafe."
			);
		}
	}
	/**
	 * Validate that a directory path is safe (no traversal, absolute or relative, no dangerous chars)
	 */
	private static isSafeDirectory(dir: string): boolean {
		if (typeof dir !== "string" || dir.length === 0) return false;
		// Disallow path traversal
		if (dir.includes("..")) return false;
		// Disallow null bytes and dangerous characters
		if (/[<>"|*?\0]/.test(dir)) return false;
		// Disallow Windows reserved names
		if (/(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])/i.test(path.basename(dir)))
			return false;
		// Optionally, require absolute or relative path (not URLs, etc.)
		if (dir.startsWith("http://") || dir.startsWith("https://")) return false;
		return true;
	}
	/**
	 * Comprehensive path validation with multiple security checks
	 */
	validatePath(
		inputPath: string,
		operationType: "read" | "write" = "read"
	): {
		isValid: boolean;
		sanitizedPath?: string;
		errors: string[];
	} {
		const errors: string[] = [];

		// Basic input validation
		if (!inputPath || typeof inputPath !== "string") {
			errors.push("Invalid input: path must be a non-empty string");
			return { isValid: false, errors };
		}

		if (inputPath.length > this.maxPathLength) {
			errors.push(`Path length exceeds maximum (${this.maxPathLength})`);
			return { isValid: false, errors };
		}

		// Check for blocked patterns
		for (const pattern of this.blockedPatterns) {
			if (pattern.test(inputPath)) {
				errors.push(`Path contains blocked pattern: ${pattern.source}`);
				return { isValid: false, errors };
			}
		}

		try {
			// Canonicalize the path to resolve all relative components
			const canonicalPath = path.resolve(inputPath);

			// Verify the path is within allowed directories
			const isWithinAllowedDir = Array.from(this.allowedDirectories).some(
				(allowedDir) => {
					return (
						canonicalPath.startsWith(allowedDir + path.sep) ||
						canonicalPath === allowedDir
					);
				}
			);

			if (!isWithinAllowedDir) {
				errors.push("Path is outside allowed directories");
				return { isValid: false, errors };
			}

			// Additional validation for write operations
			if (operationType === "write") {
				const parentDir = path.dirname(canonicalPath);
				if (!this.isDirectoryWritable(parentDir)) {
					errors.push("Parent directory is not writable");
					return { isValid: false, errors };
				}
			}

			return {
				isValid: true,
				sanitizedPath: canonicalPath,
				errors: [],
			};
		} catch (error) {
			errors.push(
				`Path resolution failed: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
			return { isValid: false, errors };
		}
	}

	/**
	 * Secure filename sanitization
	 */
	// skipcq: JS-0105
	sanitizeFilename(filename: string): string {
		if (!filename || typeof filename !== "string") {
			throw new Error("Invalid filename input");
		}

		return filename
			.replace(/[<>:"/\\|?*\0]/g, "") // Remove dangerous characters
			.replace(/\.\./g, "") // Remove path traversal attempts
			.replace(/^\.+/, "") // Remove leading dots
			.replace(/\s+/g, "_") // Replace spaces with underscores
			.slice(0, 255) // Limit filename length
			.trim();
	}

	/**
	 * Validate file extension against allowlist
	 */
	// skipcq: JS-0105
	validateFileExtension(
		filename: string,
		allowedExtensions: string[]
	): boolean {
		const ext = path.extname(filename).toLowerCase();
		return allowedExtensions.includes(ext);
	}

	/**
	 * Check if directory is writable
	 */
	// skipcq: JS-0105
	private async isDirectoryWritable(dirPath: string): Promise<boolean> {
		try {
			await fsPromises.access(dirPath, fs.constants.W_OK);
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Input sanitization utilities
 */
// skipcq: JS-0327
export class InputSanitizer {
	/**
	 * Sanitize and validate integer parameters
	 */
	static sanitizeIntParam(
		value: unknown,
		min?: number,
		max?: number
	): number | null {
		const parsed = parseInt(String(value), 10);

		if (isNaN(parsed)) {
			return null;
		}

		if (min !== undefined && parsed < min) {
			return null;
		}

		if (max !== undefined && parsed > max) {
			return null;
		}

		return parsed;
	}

	/**
	 * Sanitize string parameters
	 */
	static sanitizeStringParam(
		value: unknown,
		allowedValues?: string[],
		maxLength = 1000
	): string | null {
		if (typeof value !== "string") {
			return null;
		}

		if (value.length > maxLength) {
			return null;
		}

		// Remove potential XSS and injection attempts
		const sanitized = value.replace(/[<>"\0]/g, "").trim();

		if (allowedValues && !allowedValues.includes(sanitized)) {
			return null;
		}

		return sanitized || null;
	}

	/**
	 * Validate job ID format (alphanumeric with specific format)
	 */
	static validateJobId(jobId: unknown): string | null {
		if (typeof jobId !== "string") {
			return null;
		}

		// Job IDs should be alphanumeric, possibly with hyphens/underscores
		const jobIdPattern = /^[a-zA-Z0-9\-_]{1,64}$/;

		if (!jobIdPattern.test(jobId)) {
			return null;
		}

		return jobId;
	}
}

/**
 * Security middleware factory
 */
export function createSecurityMiddleware(validator: SecurePathValidator) {
	return {
		/**
		 * Validate file paths in requests
		 */
		// skipcq: JS-0045
		validateFilePaths: (req: Request, res: Response, next: NextFunction) => {
			// Check for file paths in common request locations
			const pathsToCheck = [
				req.body.filePath,
				req.body.path,
				req.query.filePath,
				req.query.path,
			].filter(Boolean);

			for (const pathToCheck of pathsToCheck) {
				const validation = validator.validatePath(pathToCheck);
				if (!validation.isValid) {
					return res.status(400).json({
						message: "Invalid file path",
						errors: validation.errors,
					});
				}
			}

			next();
		},

		/**
		 * Rate limiting for file operations
		 */
		rateLimitFileOps: (() => {
			const requestCounts = new Map<
				string,
				{ count: number; resetTime: number }
			>();
			const maxRequests = 100;
			const windowMs = 15 * 60 * 1000; // 15 minutes

			// skipcq: JS-0045
			return (req: Request, res: Response, next: NextFunction) => {
				const clientIp = req.ip || req.connection.remoteAddress || "unknown";
				const now = Date.now();
				if (!requestCounts.has(clientIp)) {
					requestCounts.set(clientIp, { count: 1, resetTime: now + windowMs });
					return next();
				}

				const clientData = requestCounts.get(clientIp);
				if (!clientData) {
					// This should not happen since we just checked has() above, but for type safety
					requestCounts.set(clientIp, { count: 1, resetTime: now + windowMs });
					return next();
				}

				if (now > clientData.resetTime) {
					clientData.count = 1;
					clientData.resetTime = now + windowMs;
					return next();
				}

				if (clientData.count >= maxRequests) {
					return res.status(429).json({
						message: "Too many file operation requests",
					});
				}

				clientData.count++;
				next();
			};
		})(),
	};
}
