/**
 * Enhanced Settings Panel with Job Queue Integration
 *
 * This component extends the original SettingsPanel to support background job processing
 * with real-time progress tracking and enhanced user experience.
 *
 * Key Enhancements:
 * - Asynchronous job submission with immediate feedback
 * - Priority selection for processing jobs
 * - Memory optimization toggle
 * - Real-time job progress integration
 * - Bulk processing capabilities
 * - Advanced processing options
 *
 * @format
 */

import React, { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { ProcessingSettings } from "@shared/schema";
import { logger } from "../../../shared/logger";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	Zap,
	Settings,
	Clock,
	MemoryStick,
	Layers,
	AlertTriangle,
} from "lucide-react";

// Job priority options
export enum JobPriority {
	LOW = 1,
	NORMAL = 2,
	HIGH = 3,
	CRITICAL = 4,
}

interface EnhancedSettingsPanelProps {
	/** ID of the track to process, null when no track available */
	trackId: number | null;
	/** Callback fired when processing begins successfully */
	onProcessingStart: (jobId: string) => void;
	/** Whether the panel should be disabled (e.g., during processing) */
	disabled?: boolean;
	/** Whether to show advanced options */
	showAdvanced?: boolean;
	/** Current job ID if processing is active */
	activeJobId?: string | null;
}

export const EnhancedSettingsPanel: React.FC<EnhancedSettingsPanelProps> = ({
	trackId,
	onProcessingStart,
	disabled = false,
	showAdvanced = true,
	activeJobId = null,
}) => {
	const { toast } = useToast();

	// Core processing settings
	const [settings, setSettings] = useState<ProcessingSettings>({
		introLength: 16,
		outroLength: 16,
		preserveVocals: true,
		beatDetection: "auto",
	});

	// Enhanced options
	const [priority, setPriority] = useState<JobPriority>(JobPriority.NORMAL);
	const [useOptimization, setUseOptimization] = useState(true);
	const [estimatedTime, setEstimatedTime] = useState<string>("2-5 minutes");
	const [isSubmitting, setIsSubmitting] = useState(false);

	/**
	 * Calculate estimated processing time based on settings
	 */
	useEffect(() => {
		const baseTime = 3; // Base processing time in minutes

		// Factors that affect processing time
		const complexityFactor = settings.preserveVocals ? 1.3 : 1.0;
		const beatDetectionFactor = settings.beatDetection === "madmom" ? 1.2 : 1.0;
		const lengthFactor = (settings.introLength + settings.outroLength) / 32;
		const optimizationFactor = useOptimization ? 0.7 : 1.0;
		const priorityFactor =
			priority === JobPriority.HIGH
				? 0.8
				: priority === JobPriority.LOW
				? 1.4
				: 1.0;

		const estimatedMinutes = Math.ceil(
			baseTime *
				complexityFactor *
				beatDetectionFactor *
				lengthFactor *
				optimizationFactor *
				priorityFactor
		);

		setEstimatedTime(
			`${Math.max(1, estimatedMinutes - 1)}-${estimatedMinutes + 2} minutes`
		);
	}, [settings, useOptimization, priority]);

	/**
	 * Handle intro length adjustment
	 */
	const incrementIntroLength = () => {
		if (settings.introLength < 64) {
			setSettings((prev) => ({
				...prev,
				introLength: prev.introLength + 8,
			}));
		}
	};

	const decrementIntroLength = () => {
		if (settings.introLength > 8) {
			setSettings((prev) => ({
				...prev,
				introLength: prev.introLength - 8,
			}));
		}
	};

	/**
	 * Handle outro length adjustment
	 */
	const incrementOutroLength = () => {
		if (settings.outroLength < 64) {
			setSettings((prev) => ({
				...prev,
				outroLength: prev.outroLength + 8,
			}));
		}
	};

	const decrementOutroLength = () => {
		if (settings.outroLength > 8) {
			setSettings((prev) => ({
				...prev,
				outroLength: prev.outroLength - 8,
			}));
		}
	};

	/**
	 * Toggle vocal preservation
	 */
	const togglePreserveVocals = () => {
		setSettings((prev) => ({
			...prev,
			preserveVocals: !prev.preserveVocals,
		}));
	};

	/**
	 * Handle beat detection algorithm change
	 */
	const handleBeatDetectionChange = (value: string) => {
		setSettings((prev) => ({
			...prev,
			beatDetection: value as "auto" | "librosa" | "madmom",
		}));
	};

	/**
	 * Handle priority change
	 */
	const handlePriorityChange = (value: string) => {
		setPriority(parseInt(value, 10) as JobPriority);
	};

	/**
	 * Submit processing job to queue
	 */
	const handleGenerateClick = async () => {
		if (!trackId) {
			toast({
				title: "No track selected",
				description: "Please upload a track first.",
				variant: "destructive",
			});
			return;
		}

		setIsSubmitting(true);

		try {
			const response = await fetch(`/api/tracks/${trackId}/process-async`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					...settings,
					priority,
					useOptimization,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.message || `Failed to start processing: ${response.status}`
				);
			}

			const result = await response.json();

			toast({
				title: "Processing Queued",
				description: `Your track is now queued for processing. Job ID: ${result.jobId.substring(
					0,
					8
				)}...`,
				duration: 5000,
			});

			// Notify parent component with job ID
			onProcessingStart(result.jobId);
		} catch (error) {
			logger.processingError(
				"Track processing job submission failed",
				error instanceof Error ? error : new Error(String(error)),
				{ trackId }
			);
			toast({
				title: "Processing Failed",
				description:
					(error as Error).message || "An unexpected error occurred.",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Cancel active job
	 */
	const handleCancelJob = async () => {
		if (!activeJobId) return;

		try {
			const response = await fetch(`/api/jobs/${activeJobId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error("Failed to cancel job");
			}

			toast({
				title: "Job Cancelled",
				description: "Processing job has been cancelled.",
				duration: 3000,
			});
		} catch (error) {
			logger.processingError(
				"Job cancellation failed",
				error instanceof Error ? error : new Error(String(error)),
				{ jobId: activeJobId }
			);
			toast({
				title: "Cancel Failed",
				description: "Failed to cancel the processing job.",
				variant: "destructive",
			});
		}
	};

	/**
	 * Get priority badge variant and text
	 */
	const getPriorityDisplay = (priorityValue: JobPriority) => {
		const priorities = {
			[JobPriority.LOW]: {
				text: "Low",
				variant: "secondary" as const,
				icon: Clock,
			},
			[JobPriority.NORMAL]: {
				text: "Normal",
				variant: "outline" as const,
				icon: Settings,
			},
			[JobPriority.HIGH]: {
				text: "High",
				variant: "default" as const,
				icon: Zap,
			},
			[JobPriority.CRITICAL]: {
				text: "Critical",
				variant: "destructive" as const,
				icon: AlertTriangle,
			},
		};
		return priorities[priorityValue];
	};

	const currentPriority = getPriorityDisplay(priority);
	const PriorityIcon = currentPriority.icon;

	return (
		// skipcq: JS-0415
		<Card className='w-full'>
			<CardHeader>
				<CardTitle className='flex items-center justify-between'>
					<span>Audio Processing Settings</span>
					{activeJobId && (
						<Badge variant='default' className='flex items-center gap-1'>
							<Zap size={12} />
							Processing Active
						</Badge>
					)}
				</CardTitle>
			</CardHeader>

			<CardContent className='space-y-6'>
				{/* Core Settings */}
				<div className='space-y-4'>
					<h3 className='text-lg font-semibold'>Extension Parameters</h3>

					{/* Intro Length */}
					<div className='flex items-center justify-between'>
						<Label className='font-medium'>
							Intro Length: {settings.introLength} bars
						</Label>
						<div className='flex items-center gap-2'>
							<Button
								variant='outline'
								size='sm'
								// skipcq: JS-0417
								onClick={decrementIntroLength}
								disabled={disabled || settings.introLength <= 8}>
								-
							</Button>
							<Badge variant='secondary'>{settings.introLength} bars</Badge>
							<Button
								variant='outline'
								size='sm'
								// skipcq: JS-0417
								onClick={incrementIntroLength}
								disabled={disabled || settings.introLength >= 64}>
								+
							</Button>
						</div>
					</div>

					{/* Outro Length */}
					<div className='flex items-center justify-between'>
						<Label className='font-medium'>
							Outro Length: {settings.outroLength} bars
						</Label>
						<div className='flex items-center gap-2'>
							<Button
								variant='outline'
								size='sm'
								// skipcq: JS-0417
								onClick={decrementOutroLength}
								disabled={disabled || settings.outroLength <= 8}>
								-
							</Button>
							<Badge variant='secondary'>{settings.outroLength} bars</Badge>
							<Button
								variant='outline'
								size='sm'
								// skipcq: JS-0417
								onClick={incrementOutroLength}
								disabled={disabled || settings.outroLength >= 64}>
								+
							</Button>
						</div>
					</div>

					{/* Preserve Vocals */}
					<div className='flex items-center justify-between'>
						<Label className='font-medium'>Preserve Vocals</Label>
						<Switch
							checked={settings.preserveVocals}
							// skipcq: JS-0417
							onCheckedChange={togglePreserveVocals}
							disabled={disabled}
						/>
					</div>

					{/* Beat Detection */}
					<div className='flex items-center justify-between'>
						<Label className='font-medium'>Beat Detection Algorithm</Label>
						<Select
							value={settings.beatDetection}
							// skipcq: JS-0417
							onValueChange={handleBeatDetectionChange}
							disabled={disabled}>
							<SelectTrigger className='w-32'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='auto'>Auto</SelectItem>
								<SelectItem value='librosa'>Librosa</SelectItem>
								<SelectItem value='madmom'>Madmom</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				{/* Advanced Settings */}
				{showAdvanced && (
					// skipcq: JS-0415
					<>
						<Separator />
						{/* skipcq: JS-0415 */}
						<div className='space-y-4'>
							<h3 className='text-lg font-semibold flex items-center gap-2'>
								<Settings size={18} />
								Advanced Options
							</h3>

							{/* Processing Priority */}
							<div className='flex items-center justify-between'>
								<Label className='font-medium'>Processing Priority</Label>
								<div className='flex items-center gap-2'>
									<Select
										value={priority.toString()}
										// skipcq: JS-0417
										onValueChange={handlePriorityChange}
										disabled={disabled}>
										<SelectTrigger className='w-32'>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={JobPriority.LOW.toString()}>
												Low
											</SelectItem>
											<SelectItem value={JobPriority.NORMAL.toString()}>
												Normal
											</SelectItem>
											<SelectItem value={JobPriority.HIGH.toString()}>
												High
											</SelectItem>
											<SelectItem value={JobPriority.CRITICAL.toString()}>
												Critical
											</SelectItem>
										</SelectContent>
									</Select>
									<Badge
										variant={currentPriority.variant}
										className='flex items-center gap-1'>
										<PriorityIcon size={12} />
										{currentPriority.text}
									</Badge>
								</div>
							</div>

							{/* Memory Optimization */}
							<div className='flex items-center justify-between'>
								<div>
									<Label className='font-medium flex items-center gap-2'>
										<MemoryStick size={16} />
										Memory Optimization
									</Label>
									<p className='text-sm text-gray-500 mt-1'>
										Use optimized processing for reduced memory usage
									</p>
								</div>
								<Switch
									checked={useOptimization}
									onCheckedChange={setUseOptimization}
									disabled={disabled}
								/>
							</div>

							{/* Processing Info */}
							<div className='p-4 bg-blue-50 rounded-lg border border-blue-200'>
								<div className='flex items-center gap-2 mb-2'>
									<Clock size={16} className='text-blue-600' />
									<span className='font-medium text-blue-800'>
										Estimated Processing Time
									</span>
								</div>
								<p className='text-blue-700'>{estimatedTime}</p>

								{useOptimization && (
									<div className='flex items-center gap-2 mt-2'>
										<MemoryStick size={14} className='text-green-600' />
										<span className='text-sm text-green-700'>
											Memory optimized (60-80% reduction)
										</span>
									</div>
								)}
							</div>
						</div>
					</>
				)}

				{/* Action Buttons */}
				<Separator />
				<div className='flex flex-col gap-3'>
					{!activeJobId ? (
						<Button
							// skipcq: JS-0417
							onClick={handleGenerateClick}
							disabled={disabled || !trackId || isSubmitting}
							className='w-full flex items-center justify-center gap-2'
							size='lg'>
							{isSubmitting ? (
								<>
									<div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white' />
									Queueing...
								</>
							) : (
								<>
									<Layers size={16} />
									Queue Processing Job
								</>
							)}
						</Button>
					) : (
						<Button
							// skipcq: JS-0417
							onClick={handleCancelJob}
							variant='destructive'
							className='w-full flex items-center justify-center gap-2'
							size='lg'>
							<AlertTriangle size={16} />
							Cancel Processing
						</Button>
					)}

					{/* Queue Benefits */}
					<div className='p-3 bg-green-50 rounded-lg border border-green-200'>
						<h4 className='font-medium text-green-800 mb-2'>
							Background Processing Benefits:
						</h4>
						<ul className='text-sm text-green-700 space-y-1'>
							<li>• Non-blocking: Continue using the app while processing</li>
							<li>• Real-time progress updates via WebSocket</li>
							<li>• Automatic retry on temporary failures</li>
							<li>• Priority-based processing queue</li>
							{useOptimization && <li>• Memory-optimized for large files</li>}
						</ul>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};

export default EnhancedSettingsPanel;
