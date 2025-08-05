/**
 * Job Queue Monitor Component
 *
 * A comprehensive real-time monitoring interface for background audio processing jobs.
 * This component provides:
 *
 * Core Features:
 * - Real-time job progress tracking via WebSocket
 * - Visual progress indicators with stage-specific messages
 * - Job cancellation capabilities
 * - Queue statistics and health monitoring
 * - Automatic reconnection and error handling
 * - Memory usage tracking for optimized jobs
 *
 * State Management:
 * - WebSocket connection status
 * - Active job tracking
 * - Progress updates and notifications
 * - Error handling and retry logic
 *
 * @format
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
	AlertCircle,
	CheckCircle,
	Clock,
	Zap,
	Trash2,
	Pause,
	Play,
	RotateCcw,
} from "lucide-react";

// Job status types
export interface JobStatus {
	jobId: string;
	trackId: number;
	status:
		| "waiting"
		| "active"
		| "completed"
		| "failed"
		| "progress"
		| "stalled";
	progress?: {
		percentage: number;
		stage: string;
		message: string;
		currentStep: number;
		totalSteps: number;
		estimatedTimeRemaining?: number;
		memoryUsage?: number;
	};
	data?: Record<string, unknown>;
	timestamp: string;
}

interface QueueStatsItem {
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
	paused: number;
	total: number;
}

export interface QueueStats {
	audioProcessing: QueueStatsItem;
	audioAnalysis: QueueStatsItem;
	fileCleanup: QueueStatsItem;
	notifications: QueueStatsItem;
	timestamp: string;
}

interface JobQueueMonitorProps {
	/** ID of the user for filtering relevant jobs */
	userId: number;
	/** Whether to show admin controls */
	isAdmin?: boolean;
	/** Called when a job completes successfully */
	onJobComplete?: (jobId: string, trackId: number) => void;
	/** Called when a job fails */
	onJobFailed?: (jobId: string, trackId: number, error: string) => void;
}

export const JobQueueMonitor: React.FC<JobQueueMonitorProps> = ({
	userId,
	isAdmin = false,
	onJobComplete,
	onJobFailed,
}) => {
	const { toast } = useToast();
	const socketRef = useRef<Socket | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Component state
	const [isConnected, setIsConnected] = useState(false);
	const [activeJobs, setActiveJobs] = useState<Map<string, JobStatus>>(
		new Map()
	);
	const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [reconnectAttempts, setReconnectAttempts] = useState(0);

	/**
	 * Schedule reconnection attempt
	 */
	const scheduleReconnect = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
		}

		// Increment reconnect attempts which will trigger the reconnection effect
		setReconnectAttempts((prev) => prev + 1);
	}, []);

	/**
	 * Handle job status updates
	 */
	const handleJobUpdate = useCallback(
		(jobUpdate: JobStatus) => {
			const { jobId, status, trackId } = jobUpdate;

			setActiveJobs((prev) => {
				const updated = new Map(prev);

				if (status === "completed") {
					// Remove completed job and notify parent
					updated.delete(jobId);
					onJobComplete?.(jobId, trackId);

					toast({
						title: "Job Completed",
						description: `Audio processing completed for track ${trackId}`,
						duration: 5000,
					});
				} else if (status === "failed") {
					// Remove failed job and notify parent
					updated.delete(jobId);
					const error = String(jobUpdate.data?.error || "Unknown error");
					onJobFailed?.(jobId, trackId, error);

					toast({
						title: "Job Failed",
						description: `Audio processing failed for track ${trackId}: ${error}`,
						variant: "destructive",
						duration: 7000,
					});
				} else {
					// Update active job
					updated.set(jobId, jobUpdate);
				}

				return updated;
			});
		},
		[onJobComplete, onJobFailed, toast]
	);

	/**
	 * Initialize WebSocket connection
	 */
	const initializeWebSocket = useCallback(() => {
		if (socketRef.current?.connected) {
			return; // Already connected
		}

		try {
			const socket = io({
				transports: ["websocket", "polling"],
				timeout: 20000,
				forceNew: true,
			});

			socketRef.current = socket;

			// Connection event handlers
			socket.on("connect", () => {
				setIsConnected(true);
				setConnectionError(null);
				setReconnectAttempts(0);

				// Authenticate with the server
				socket.emit("authenticate", { userId, isAdmin });
			});

			socket.on("disconnect", (reason) => {
				setIsConnected(false);

				if (reason === "io server disconnect") {
					// Server initiated disconnect, try to reconnect
					scheduleReconnect();
				}
			});

			socket.on("connect_error", (error) => {
				setConnectionError(error.message);
				setIsConnected(false);
				scheduleReconnect();
			});

			// Authentication confirmation
			socket.on("authenticated", (_data) => {
				toast({
					title: "Connected",
					description: "Real-time job monitoring active",
					duration: 3000,
				});
			});

			// Job update events
			socket.on("job-update", (jobUpdate: JobStatus) => {
				handleJobUpdate(jobUpdate);
			});

			// Queue statistics updates (admin only)
			if (isAdmin) {
				socket.on("queue-stats", (stats: QueueStats) => {
					setQueueStats(stats);
				});

				socket.on("queues-paused", () => {
					toast({
						title: "Queues Paused",
						description: "All job queues have been paused",
						duration: 5000,
					});
				});

				socket.on("queues-resumed", () => {
					toast({
						title: "Queues Resumed",
						description: "All job queues have been resumed",
						duration: 5000,
					});
				});
			}

			// Notification events
			socket.on("notification", (notification) => {
				toast({
					title: "Job Notification",
					description: notification.message,
					duration: 5000,
				});
			});

			// Error events
			socket.on("error", (error) => {
				toast({
					title: "Job Queue Error",
					description: error.message || "An error occurred",
					variant: "destructive",
					duration: 5000,
				});
			});

			// Server shutdown notification
			socket.on("server-shutdown", (data) => {
				toast({
					title: "Server Maintenance",
					description: data.message,
					variant: "destructive",
					duration: 10000,
				});
				setIsConnected(false);
			});
		} catch (error) {
			setConnectionError(
				error instanceof Error ? error.message : "Connection failed"
			);
			scheduleReconnect();
		}
	}, [userId, isAdmin, toast, scheduleReconnect, handleJobUpdate]);

	// Effect to handle reconnection attempts
	// skipcq: JS-0045
	useEffect(() => {
		if (reconnectAttempts > 0) {
			const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
			const timeout = setTimeout(() => {
				initializeWebSocket();
			}, delay);

			// skipcq: JS-0045
			return () => clearTimeout(timeout);
		}
	}, [reconnectAttempts, initializeWebSocket]);

	/**
	 * Cancel a specific job
	 */
	const cancelJob = useCallback(
		async (jobId: string) => {
			if (!socketRef.current?.connected) {
				toast({
					title: "Connection Error",
					description: "Not connected to job queue server",
					variant: "destructive",
				});
				return;
			}

			try {
				socketRef.current.emit("cancel-job", { jobId });

				// Optimistically remove from active jobs
				setActiveJobs((prev) => {
					const updated = new Map(prev);
					updated.delete(jobId);
					return updated;
				});

				toast({
					title: "Job Cancelled",
					description: "Processing job has been cancelled",
					duration: 3000,
				});
			} catch {
				toast({
					title: "Cancel Failed",
					description: "Failed to cancel job",
					variant: "destructive",
				});
			}
		},
		[toast]
	);

	/**
	 * Request queue statistics (admin only)
	 */
	const requestQueueStats = useCallback(() => {
		if (socketRef.current?.connected && isAdmin) {
			socketRef.current.emit("get-queue-stats");
		}
	}, [isAdmin]);

	/**
	 * Pause all queues (admin only)
	 */
	const pauseQueues = useCallback(() => {
		if (socketRef.current?.connected && isAdmin) {
			socketRef.current.emit("pause-queues");
		}
	}, [isAdmin]);

	/**
	 * Resume all queues (admin only)
	 */
	const resumeQueues = useCallback(() => {
		if (socketRef.current?.connected && isAdmin) {
			socketRef.current.emit("resume-queues");
		}
	}, [isAdmin]);

	/**
	 * Manual reconnection
	 */
	const reconnect = useCallback(() => {
		if (socketRef.current) {
			socketRef.current.disconnect();
			socketRef.current = null;
		}
		setReconnectAttempts(0);
		initializeWebSocket();
	}, [initializeWebSocket]);

	// Initialize WebSocket on component mount
	// skipcq: JS-0045
	useEffect(() => {
		initializeWebSocket();

		return () => {
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
			if (socketRef.current) {
				socketRef.current.disconnect();
			}
		};
	}, [initializeWebSocket]);

	/**
	 * Render job status badge
	 */
	const renderStatusBadge = (status: string) => {
		const statusConfig = {
			waiting: { variant: "secondary" as const, icon: Clock, text: "Waiting" },
			active: { variant: "default" as const, icon: Zap, text: "Processing" },
			completed: {
				variant: "success" as const,
				icon: CheckCircle,
				text: "Completed",
			},
			failed: {
				variant: "destructive" as const,
				icon: AlertCircle,
				text: "Failed",
			},
			stalled: {
				variant: "warning" as const,
				icon: AlertCircle,
				text: "Stalled",
			},
			progress: { variant: "default" as const, icon: Zap, text: "In Progress" },
		};

		const config =
			statusConfig[status as keyof typeof statusConfig] || statusConfig.waiting;
		const Icon = config.icon;

		return (
			<Badge variant={config.variant} className='flex items-center gap-1'>
				<Icon size={12} />
				{config.text}
			</Badge>
		);
	};

	/**
	 * Format memory usage
	 */
	const formatMemoryUsage = (bytes?: number) => {
		if (!bytes) return null;

		const mb = bytes / (1024 * 1024);
		if (mb < 1024) {
			return `${mb.toFixed(1)} MB`;
		} else {
			return `${(mb / 1024).toFixed(2)} GB`;
		}
	};

	/**
	 * Render individual job card
	 */
	const renderJobCard = (job: JobStatus) => {
		const { jobId, trackId, status, progress } = job;

		return (
			// skipcq: JS-0415
			<Card key={jobId} className='mb-4'>
				<CardHeader className='pb-2'>
					<div className='flex justify-between items-center'>
						<div>
							<CardTitle className='text-lg'>Track {trackId}</CardTitle>
							<p className='text-sm text-gray-500'>
								Job ID: {jobId.substring(0, 8)}...
							</p>
						</div>
						<div className='flex items-center gap-2'>
							{renderStatusBadge(status)}
							{(status === "waiting" ||
								status === "active" ||
								status === "progress") && (
								<Button
									variant='outline'
									size='sm'
									// skipcq: JS-0417
									onClick={() => cancelJob(jobId)}
									className='flex items-center gap-1'>
									<Trash2 size={14} />
									Cancel
								</Button>
							)}
						</div>
					</div>
				</CardHeader>

				<CardContent>
					{progress && (
						<div className='space-y-3'>
							<div>
								<div className='flex justify-between text-sm mb-1'>
									<span className='font-medium'>{progress.stage}</span>
									<span className='text-primary'>
										{Math.round(progress.percentage)}%
									</span>
								</div>
								<Progress value={progress.percentage} className='h-2' />
							</div>

							<p className='text-sm text-gray-600'>{progress.message}</p>

							<div className='flex justify-between text-xs text-gray-500'>
								<span>
									Step {progress.currentStep} of {progress.totalSteps}
								</span>
								{progress.estimatedTimeRemaining && (
									<span>
										{Math.round(progress.estimatedTimeRemaining / 1000)}s
										remaining
									</span>
								)}
							</div>

							{progress.memoryUsage && (
								<div className='text-xs text-blue-600'>
									Memory: {formatMemoryUsage(progress.memoryUsage)}
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		);
	};

	return (
		// skipcq: JS-0415
		<div className='space-y-6'>
			{/* Connection Status */}
			<Card>
				<CardHeader>
					<CardTitle className='flex items-center justify-between'>
						<span>Job Queue Monitor</span>
						<div className='flex items-center gap-2'>
							<Badge variant={isConnected ? "success" : "destructive"}>
								{isConnected ? "Connected" : "Disconnected"}
							</Badge>
							{!isConnected && (
								<Button variant='outline' size='sm' onClick={reconnect}>
									<RotateCcw size={14} className='mr-1' />
									Reconnect
								</Button>
							)}
						</div>
					</CardTitle>
				</CardHeader>

				{connectionError && (
					<CardContent>
						<div className='p-3 bg-red-50 border border-red-200 rounded-md'>
							<p className='text-sm text-red-700'>
								Connection Error: {connectionError}
							</p>
							{reconnectAttempts > 0 && (
								<p className='text-xs text-red-600 mt-1'>
									Reconnect attempts: {reconnectAttempts}
								</p>
							)}
						</div>
					</CardContent>
				)}
			</Card>

			{/* Active Jobs */}
			{activeJobs.size > 0 && (
				<div>
					<h3 className='text-lg font-semibold mb-4'>
						Active Jobs ({activeJobs.size})
					</h3>
					{Array.from(activeJobs.values()).map(renderJobCard)}
				</div>
			)}

			{/* Admin Controls */}
			{isAdmin && isConnected && (
				<Card>
					<CardHeader>
						<CardTitle>Admin Controls</CardTitle>
					</CardHeader>
					<CardContent>
						<div className='flex gap-2 mb-4'>
							<Button variant='outline' onClick={pauseQueues}>
								<Pause size={14} className='mr-1' />
								Pause Queues
							</Button>
							<Button variant='outline' onClick={resumeQueues}>
								<Play size={14} className='mr-1' />
								Resume Queues
							</Button>
							<Button variant='outline' onClick={requestQueueStats}>
								<RotateCcw size={14} className='mr-1' />
								Refresh Stats
							</Button>
						</div>

						{queueStats && (
							<div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
								<div className='p-3 bg-blue-50 rounded-lg'>
									<p className='text-sm font-medium text-blue-700'>
										Audio Processing
									</p>
									<p className='text-lg font-bold text-blue-900'>
										{queueStats.audioProcessing.active} /{" "}
										{queueStats.audioProcessing.total}
									</p>
									<p className='text-xs text-blue-600'>Active / Total</p>
								</div>

								<div className='p-3 bg-green-50 rounded-lg'>
									<p className='text-sm font-medium text-green-700'>Analysis</p>
									<p className='text-lg font-bold text-green-900'>
										{queueStats.audioAnalysis.active} /{" "}
										{queueStats.audioAnalysis.total}
									</p>
									<p className='text-xs text-green-600'>Active / Total</p>
								</div>

								<div className='p-3 bg-yellow-50 rounded-lg'>
									<p className='text-sm font-medium text-yellow-700'>Cleanup</p>
									<p className='text-lg font-bold text-yellow-900'>
										{queueStats.fileCleanup.active} /{" "}
										{queueStats.fileCleanup.total}
									</p>
									<p className='text-xs text-yellow-600'>Active / Total</p>
								</div>

								<div className='p-3 bg-purple-50 rounded-lg'>
									<p className='text-sm font-medium text-purple-700'>
										Notifications
									</p>
									<p className='text-lg font-bold text-purple-900'>
										{queueStats.notifications.active} /{" "}
										{queueStats.notifications.total}
									</p>
									<p className='text-xs text-purple-600'>Active / Total</p>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Empty State */}
			{activeJobs.size === 0 && isConnected && (
				<Card>
					<CardContent className='text-center py-8'>
						<CheckCircle size={48} className='mx-auto text-gray-400 mb-4' />
						<h3 className='text-lg font-semibold text-gray-600 mb-2'>
							No Active Jobs
						</h3>
						<p className='text-sm text-gray-500'>
							All audio processing jobs are completed. New jobs will appear here
							automatically.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
};

export default JobQueueMonitor;
