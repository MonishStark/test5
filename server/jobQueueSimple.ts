/**
 * Simplified Job Queue for Development (Fallback Mode)
 *
 * This is a minimal implementation that processes jobs directly when Redis is not available.
 * For production use, Redis should be properly configured for the full job queue system.
 *
 * @format
 */

import { storage } from "./storage";
import { ProcessingSettings } from "@shared/schema";
import { spawn } from "child_process";
import path from "path";
import { promises as fsPromises } from "fs";
import { sanitizeForLog } from "../shared/logger";

// Job priority levels
export enum JobPriority {
	LOW = 1,
	NORMAL = 2,
	HIGH = 3,
	CRITICAL = 4,
}

// Job status types
export enum JobStatus {
	WAITING = "waiting",
	ACTIVE = "active",
	COMPLETED = "completed",
	FAILED = "failed",
	DELAYED = "delayed",
	PAUSED = "paused",
}

// Job data interfaces
export interface AudioProcessingJobData {
	jobId: string;
	trackId: number;
	originalPath: string;
	outputPath: string;
	settings: ProcessingSettings;
	userId: number;
	priority: JobPriority;
	retryAttempt?: number;
	useOptimization?: boolean;
}

export interface JobProgress {
	percentage: number;
	stage: string;
	message: string;
	currentStep: number;
	totalSteps: number;
	estimatedTimeRemaining?: number;
	memoryUsage?: number;
}

export interface AudioAnalysisJobData {
	jobId: string;
	trackId: number;
	filePath: string;
	userId: number;
}

export interface FileCleanupJobData {
	jobId: string;
	filePaths: string[];
	trackId?: number;
	userId?: number;
}

export interface PythonScriptResult {
	stdout: string;
	stderr: string;
}

export interface ActiveJob extends AudioProcessingJobData {
	status: JobStatus;
	progress?: JobProgress;
	error?: string;
	createdAt?: number;
}

export interface JobUpdateData {
	jobId: string;
	trackId: number;
	userId: number;
	status: JobStatus;
	progress?: JobProgress;
	timestamp: string;
}

export interface SocketIO {
	to: (room: string) => {
		emit: (event: string, data: JobUpdateData) => void;
	};
}

/**
 * Simplified Job Queue Manager (Development/Fallback Mode)
 *
 * Processes jobs directly without Redis queue for development purposes.
 */
class SimpleJobQueueManager {
	private activeJobs: Map<string, ActiveJob> = new Map();
	private socketIo?: SocketIO;

	constructor() {
		console.log(
			"📝 Job Queue running in direct processing mode (Redis not available)"
		);
	}

	setSocketIo(io: SocketIO) {
		this.socketIo = io;
	}

	/**
	 * Add audio processing job (direct processing)
	 */
	async addAudioProcessingJob(data: AudioProcessingJobData): Promise<string> {
		console.log(
			`🎵 Starting direct audio processing for track ${data.trackId}`
		);

		// Store job info
		this.activeJobs.set(data.jobId, {
			...data,
			status: JobStatus.ACTIVE,
			progress: {
				percentage: 0,
				stage: "starting",
				message: "Initializing...",
				currentStep: 1,
				totalSteps: 6,
			},
		});

		// Process immediately in background
		this.processAudioJob(data).catch((error) => {
			console.error("❌ Direct processing failed:", error);
			this.activeJobs.set(data.jobId, {
				...data,
				status: JobStatus.FAILED,
				error: error.message,
			});
		});

		return data.jobId;
	}

	/**
	 * Get job status
	 */
	async getJobStatus(jobId: string) {
		const job = this.activeJobs.get(jobId);
		if (!job) {
			return { status: "not_found" };
		}

		return {
			jobId,
			status: job.status,
			progress: job.progress,
			error: job.error,
		};
	}

	/**
	 * Cancel job (mark as cancelled)
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		const job = this.activeJobs.get(jobId);
		if (job && job.status === JobStatus.ACTIVE) {
			job.status = JobStatus.FAILED;
			job.error = "Cancelled by user";
			console.log(`🚫 Job ${jobId} marked as cancelled`);
			return true;
		}
		return false;
	}

	/**
	 * Process audio job directly
	 */
	private async processAudioJob(data: AudioProcessingJobData): Promise<void> {
		const updateProgress = (progress: Partial<JobProgress>) => {
			const job = this.activeJobs.get(data.jobId);
			if (job) {
				job.progress = {
					percentage: 0,
					stage: "",
					message: "",
					currentStep: 1,
					totalSteps: 1,
					...job.progress,
					...progress,
				};

				// Emit progress via WebSocket if available
				if (this.socketIo) {
					this.socketIo.to(`user-${data.userId}`).emit("job-update", {
						jobId: data.jobId,
						trackId: data.trackId,
						userId: data.userId,
						status: job.status,
						progress: job.progress,
						timestamp: new Date().toISOString(),
					});
				}
			}
		};

		try {
			// Update database status
			await storage.updateAudioTrack(data.trackId, { status: "processing" });

			// Step 1: Setup
			updateProgress({
				percentage: 10,
				stage: "setup",
				message: "Setting up processing environment...",
				currentStep: 1,
			});

			// Step 2: File validation
			updateProgress({
				percentage: 20,
				stage: "validation",
				message: "Validating audio file...",
				currentStep: 2,
			});

			try {
				await fsPromises.access(data.originalPath);
			} catch {
				throw new Error("Source audio file not found");
			}

			// Step 3: Processing
			updateProgress({
				percentage: 30,
				stage: "processing",
				message: "Processing audio...",
				currentStep: 3,
			});

			// Determine which Python script to use
			const scriptName = data.useOptimization
				? "audioProcessor_optimized.py"
				: "audioProcessor.py";
			const scriptPath = path.join(__dirname, scriptName);

			// Check if optimized script exists, fallback to regular if not
			let finalScriptPath: string;
			try {
				await fsPromises.access(scriptPath);
				finalScriptPath = scriptPath;
			} catch {
				finalScriptPath = path.join(__dirname, "audioProcessor.py");
			}

			// Run Python processing
			await this.runPythonScript(finalScriptPath, data, updateProgress);

			// Step 4: Validation
			updateProgress({
				percentage: 80,
				stage: "validation",
				message: "Validating output...",
				currentStep: 5,
			});

			try {
				await fsPromises.access(data.outputPath);
			} catch {
				throw new Error("Processing completed but output file not found");
			}

			// Step 5: Finalization
			updateProgress({
				percentage: 90,
				stage: "finalizing",
				message: "Finalizing...",
				currentStep: 6,
			});

			// Update database
			await storage.updateAudioTrack(data.trackId, {
				status: "completed",
				extendedPaths: data.outputPath ? [data.outputPath] : undefined,
			});

			// Complete
			updateProgress({
				percentage: 100,
				stage: "completed",
				message: "Processing completed successfully!",
				currentStep: 6,
			});

			const job = this.activeJobs.get(data.jobId);
			if (job) {
				job.status = JobStatus.COMPLETED;
			}

			console.log(`✅ Direct processing completed for track ${data.trackId}`);
		} catch (error) {
			console.error(
				`❌ Direct processing failed for track ${sanitizeForLog(
					data.trackId
				)}:`,
				error
			);

			// Update database
			await storage.updateAudioTrack(data.trackId, { status: "error" });

			// Update job status
			const job = this.activeJobs.get(data.jobId);
			if (job) {
				job.status = JobStatus.FAILED;
				job.error = error instanceof Error ? error.message : String(error);
			}

			throw error;
		}
	}

	/**
	 * Run Python script for audio processing
	 */
	// skipcq: JS-0105
	private async runPythonScript(
		scriptPath: string,
		data: AudioProcessingJobData,
		updateProgress: (progress: Partial<JobProgress>) => void
	): Promise<PythonScriptResult> {
		return new Promise((resolve, reject) => {
			const args = [
				scriptPath,
				data.originalPath,
				data.outputPath,
				data.settings.introLength?.toString() || "16",
				data.settings.outroLength?.toString() || "16",
				data.settings.preserveVocals ? "true" : "false",
				data.settings.beatDetection || "auto",
			];

			console.log("🐍 Running Python script:", args.join(" "));

			const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
			if (pythonExecutable === "python") {
				console.warn(
					"[Security Warning] Using 'python' from PATH. Set the PYTHON_EXECUTABLE environment variable to specify an absolute path to the Python interpreter."
				);
			}

			const pythonProcess = spawn(pythonExecutable, args, {
				cwd: __dirname,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";
			let lastProgress = 30;

			pythonProcess.stdout?.on("data", (data) => {
				stdout += data.toString();

				// Simulate progress updates
				lastProgress = Math.min(75, lastProgress + 5);
				updateProgress({
					percentage: lastProgress,
					stage: "processing",
					message: "Audio processing in progress...",
					currentStep: 4,
				});
			});

			pythonProcess.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			pythonProcess.on("close", (code) => {
				if (code === 0) {
					console.log("✅ Python script completed successfully");
					resolve({ stdout, stderr });
				} else {
					console.error("❌ Python script failed with code:", code);
					console.error("Error output:", stderr);
					reject(
						new Error(`Python script failed with exit code ${code}: ${stderr}`)
					);
				}
			});

			pythonProcess.on("error", (error) => {
				console.error("❌ Failed to start Python script:", error);
				reject(new Error(`Failed to start Python script: ${error.message}`));
			});
		});
	}

	/**
	 * Get queue statistics (simplified)
	 */
	async getQueueStats() {
		const active = Array.from(this.activeJobs.values()).filter(
			(job) => job.status === JobStatus.ACTIVE
		).length;
		const completed = Array.from(this.activeJobs.values()).filter(
			(job) => job.status === JobStatus.COMPLETED
		).length;
		const failed = Array.from(this.activeJobs.values()).filter(
			(job) => job.status === JobStatus.FAILED
		).length;

		return {
			timestamp: new Date().toISOString(),
			queues: {
				audioProcessing: {
					waiting: 0,
					active,
					completed,
					failed,
					total: this.activeJobs.size,
				},
			},
			summary: {
				totalJobs: this.activeJobs.size,
				activeJobs: active,
				waitingJobs: 0,
				failedJobs: failed,
			},
		};
	}

	/**
	 * Health check
	 */
	async getHealth() {
		const stats = await this.getQueueStats();
		const failureRate =
			stats.summary.totalJobs > 0
				? ((stats.summary.failedJobs / stats.summary.totalJobs) * 100).toFixed(
						2
				  )
				: "0.00";

		return {
			status: "healthy",
			mode: "direct-processing",
			timestamp: new Date().toISOString(),
			metrics: {
				totalJobs: stats.summary.totalJobs,
				activeJobs: stats.summary.activeJobs,
				failedJobs: stats.summary.failedJobs,
				failureRate: `${failureRate}%`,
			},
			thresholds: {
				maxFailureRate: "10%",
				maxActiveJobs: 20,
			},
		};
	}

	/**
	 * Cleanup old jobs from memory
	 */
	cleanupOldJobs() {
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		let cleaned = 0;

		for (const [jobId, job] of this.activeJobs.entries()) {
			if (
				job.createdAt &&
				job.createdAt < oneHourAgo &&
				(job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED)
			) {
				this.activeJobs.delete(jobId);
				cleaned++;
			}
		}

		if (cleaned > 0) {
			console.log(`🧹 Cleaned up ${cleaned} old jobs from memory`);
		}
	}

	/**
	 * Graceful shutdown
	 */
	async shutdown() {
		console.log("🔄 Shutting down job queue manager...");

		// Cancel active jobs
		for (const [_jobId, job] of this.activeJobs.entries()) {
			if (job.status === JobStatus.ACTIVE) {
				job.status = JobStatus.FAILED;
				job.error = "Server shutdown";
			}
		}

		console.log("✅ Job queue manager shutdown completed");
	}

	// Placeholder methods for compatibility
	// skipcq: JS-0105
	async addAudioAnalysisJob(data: AudioAnalysisJobData): Promise<string> {
		console.log("📊 Audio analysis not available in fallback mode");
		return data.jobId;
	}

	// skipcq: JS-0105
	async addFileCleanupJob(data: FileCleanupJobData): Promise<string> {
		console.log("🧹 File cleanup will be handled manually in fallback mode");
		return data.jobId;
	}
	// skipcq: JS-0105
	async addNotificationJob(
		userId: number,
		trackId: number,
		type: string,
		message: string
	): Promise<string> {
		// skipcq: JS-0246
		console.log(`📢 Notification (${type}): ${message}`);
		// skipcq: JS-0246
		return "notification-" + Date.now();
	}

	// skipcq: JS-0105
	async pauseAllQueues(): Promise<void> {
		console.log("⏸️ Queue pause not available in fallback mode");
	}

	// skipcq: JS-0105
	async resumeAllQueues(): Promise<void> {
		console.log("▶️ Queue resume not available in fallback mode");
	}
}

// Create and export the job queue manager instance
export const jobQueueManager = new SimpleJobQueueManager();

// Cleanup interval
setInterval(() => {
	jobQueueManager.cleanupOldJobs();
}, 30 * 60 * 1000); // Every 30 minutes

export default jobQueueManager;
