/**
 * Centralized logging utility for the music DJ application
 * Provides structured logging with different levels and environments
 *
 * @format
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	FATAL = 4,
}

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	context?: Record<string, unknown>;
	error?: Error;
	module?: string;
}

/**
 * Utility function to sanitize user input for safe logging
 * Prevents log injection attacks and controls log output format
 * Consolidated from multiple files to maintain single source of truth
 */
export function sanitizeForLog(input: unknown): string {
	if (input === null || input === undefined) {
		return String(input);
	}

	const strInput = typeof input === "string" ? input : String(input);

	// Remove all percent signs (to prevent format string attacks), control characters, and non-printable characters
	// that could be used for log injection or manipulation. This is more robust than trying to match all possible format specifiers.
	return strInput
		.replace(/%/gu, "") // Remove all percent signs to prevent format string attacks
		.replace(/[\x00-\x1F\x7F]/gu, "") // Remove control characters for security, allow Unicode
		.substring(0, 1000); // Limit length to prevent log flooding
}

class Logger {
	private isDevelopment: boolean;
	private minLogLevel: LogLevel;

	constructor() {
		this.isDevelopment = process.env.NODE_ENV === "development";
		this.minLogLevel = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
	}

	private shouldLog(level: LogLevel): boolean {
		return level >= this.minLogLevel;
	}

	private formatLogEntry(entry: LogEntry): string {
		const levelNames = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
		const prefix = `[${entry.timestamp}] ${levelNames[entry.level]}`;
		const moduleInfo = entry.module ? ` [${entry.module}]` : "";

		let message = `${prefix}${moduleInfo}: ${entry.message}`;

		if (entry.context && Object.keys(entry.context).length > 0) {
			message += ` | Context: ${JSON.stringify(entry.context)}`;
		}

		if (entry.error) {
			message += ` | Error: ${entry.error.message}`;
			if (this.isDevelopment && entry.error.stack) {
				message += `\nStack: ${entry.error.stack}`;
			}
		}

		return message;
	}

	private log(
		level: LogLevel,
		message: string,
		context?: Record<string, unknown>,
		error?: Error,
		module?: string
	): void {
		if (!this.shouldLog(level)) return;

		const entry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			message,
			context,
			error,
			module,
		};

		const formattedMessage = this.formatLogEntry(entry);

		// In production, we might want to send logs to a service
		// For now, we'll use console but in a controlled way
		if (this.isDevelopment) {
			switch (level) {
				case LogLevel.DEBUG:
					// eslint-disable-next-line no-console
					console.debug(formattedMessage);
					break;
				case LogLevel.INFO:
					// eslint-disable-next-line no-console
					console.info(formattedMessage);
					break;
				case LogLevel.WARN:
					// eslint-disable-next-line no-console
					console.warn(formattedMessage);
					break;
				case LogLevel.ERROR:
				case LogLevel.FATAL:
					// eslint-disable-next-line no-console
					console.error(formattedMessage);
					break;
				default:
					break;
			}
		} else {
			// In production, only log errors and above
			if (level >= LogLevel.ERROR) {
				// eslint-disable-next-line no-console
				console.error(formattedMessage);
			}
		}

		// TODO: In production, send to logging service
		// this.sendToLoggingService(entry);
	}

	debug(
		message: string,
		context?: Record<string, unknown>,
		module?: string
	): void {
		this.log(LogLevel.DEBUG, message, context, undefined, module);
	}

	info(
		message: string,
		context?: Record<string, unknown>,
		module?: string
	): void {
		this.log(LogLevel.INFO, message, context, undefined, module);
	}

	warn(
		message: string,
		context?: Record<string, unknown>,
		error?: Error,
		module?: string
	): void {
		this.log(LogLevel.WARN, message, context, error, module);
	}

	error(
		message: string,
		error?: Error,
		context?: Record<string, unknown>,
		module?: string
	): void {
		this.log(LogLevel.ERROR, message, context, error, module);
	}

	fatal(
		message: string,
		error?: Error,
		context?: Record<string, unknown>,
		module?: string
	): void {
		this.log(LogLevel.FATAL, message, context, error, module);
	}

	// Helper methods for common patterns
	apiError(
		endpoint: string,
		error: Error,
		context?: Record<string, unknown>
	): void {
		this.error(`API Error in ${endpoint}`, error, context, "API");
	}

	uploadError(
		operation: string,
		error: Error,
		context?: Record<string, unknown>
	): void {
		this.error(`Upload Error: ${operation}`, error, context, "UPLOAD");
	}

	processingError(
		operation: string,
		error: Error,
		context?: Record<string, unknown>
	): void {
		this.error(`Processing Error: ${operation}`, error, context, "PROCESSING");
	}

	securityWarning(message: string, context?: Record<string, unknown>): void {
		this.warn(`Security Warning: ${message}`, context, undefined, "SECURITY");
	}

	websocketInfo(message: string, context?: Record<string, unknown>): void {
		this.info(`WebSocket: ${message}`, context, "WEBSOCKET");
	}

	websocketError(
		message: string,
		error?: Error,
		context?: Record<string, unknown>
	): void {
		this.error(`WebSocket Error: ${message}`, error, context, "WEBSOCKET");
	}
}

// Create singleton instance
export const logger = new Logger();

// For compatibility during migration, we can also export a simple interface
export const log = {
	debug: (message: string, ...args: unknown[]) =>
		logger.debug(message, { args }),
	info: (message: string, ...args: unknown[]) => logger.info(message, { args }),
	warn: (message: string, ...args: unknown[]) => logger.warn(message, { args }),
	error: (message: string, error?: Error | unknown, ...args: unknown[]) => {
		const errorObj = error instanceof Error ? error : undefined;
		logger.error(message, errorObj, {
			error: error instanceof Error ? undefined : error,
			args,
		});
	},
};
