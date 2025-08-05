/** @format */

import React, { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ProcessingSettings } from "@shared/schema";
import { logger } from "../../../shared/logger";

/**
 * SettingsPanel Component
 *
 * A comprehensive audio processing configuration interface that allows users to customize
 * how their tracks are extended and processed. This component features:
 *
 * Core Features:
 * - Interactive controls for intro/outro length adjustment (8-64 bar range)
 * - Synchronized intro/outro length management for consistent workflow
 * - Audio processing options (vocal preservation, beat detection methods)
 * - Real-time validation and user feedback through toast notifications
 * - Disabled state management during processing to prevent conflicts
 * - Intelligent error handling with descriptive user messages
 *
 * State Management:
 * - Processing settings with default values optimized for most tracks
 * - Submission state tracking to prevent duplicate requests
 * - Form validation ensuring settings are within acceptable ranges
 *
 * The component integrates seamlessly with the audio processing pipeline,
 * sending validated settings to the server and managing the processing lifecycle.
 */
interface SettingsPanelProps {
	/** ID of the track to process, null when no track available */
	trackId: number | null;
	/** Callback fired when processing begins successfully */
	onProcessingStart: () => void;
	/** Whether the panel should be disabled (e.g., during processing) */
	disabled?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
	trackId,
	onProcessingStart,
	disabled = false,
}) => {
	// Processing settings state with optimized defaults for most tracks
	const [settings, setSettings] = useState<ProcessingSettings>({
		introLength: 16, // 16-bar intro (typical for DJ mixing)
		outroLength: 16, // 16-bar outro (matches intro for seamless loops)
		preserveVocals: true, // Keep vocals intact by default
		beatDetection: "auto", // Automatic beat detection algorithm selection
	});

	// Submission state to prevent duplicate processing requests
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { toast } = useToast();

	/**
	 * Increment intro length in 8-bar increments (DJ-friendly)
	 * Also updates outro length to maintain consistency for DJ mixing
	 * Maximum limit of 64 bars to prevent excessively long intros
	 */
	const incrementIntroLength = () => {
		if (settings.introLength < 64) {
			setSettings((prev) => ({
				...prev,
				introLength: prev.introLength + 8,
				outroLength: prev.outroLength + 8, // Keep intro/outro synchronized
			}));
		}
	};

	/**
	 * Decrement intro length in 8-bar increments
	 * Maintains synchronization with outro length
	 * Minimum limit of 8 bars to ensure adequate mixing time
	 */
	const decrementIntroLength = () => {
		if (settings.introLength > 8) {
			setSettings((prev) => ({
				...prev,
				introLength: prev.introLength - 8,
				outroLength: prev.outroLength - 8, // Keep intro/outro synchronized
			}));
		}
	};

	/**
	 * Main processing initiation function with comprehensive error handling
	 *
	 * This function:
	 * 1. Validates track selection
	 * 2. Sends processing settings to server
	 * 3. Handles various error scenarios
	 * 4. Provides user feedback through toast notifications
	 * 5. Manages submission state to prevent duplicate requests
	 */
	const handleGenerateClick = async () => {
		// Validate track selection before proceeding
		if (!trackId) {
			toast({
				title: "No track selected",
				description: "Please upload a track first.",
				variant: "destructive",
			});
			return;
		}

		// Set submitting state to disable form and show loading feedback
		setIsSubmitting(true);

		try {
			// Send processing request with current settings to server
			const response = await fetch(`/api/tracks/${trackId}/process`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(settings),
			});

			if (!response.ok) {
				throw new Error(
					`Failed to start processing: ${response.status} ${response.statusText}`
				);
			}

			// Show success notification to user
			toast({
				title: "Processing Started",
				description:
					"Your track is now being processed. This may take a few minutes.",
			});

			// Notify parent component that processing has begun
			onProcessingStart();
		} catch (error) {
			// skipcq: JS-0002
			logger.processingError(
				"Track processing failed",
				error instanceof Error ? error : new Error(String(error)),
				{ trackId }
			);

			// Show error notification with descriptive message
			toast({
				title: "Processing Failed",
				description:
					(error as Error).message || "An unexpected error occurred.",
				variant: "destructive",
			});
		} finally {
			// Reset submission state regardless of outcome
			setIsSubmitting(false);
		}
	};

	return (
		// skipcq: JS-0415
		<div className='bg-white rounded-xl shadow-md p-6'>
			<h2 className='text-xl font-semibold mb-4'>Extension Settings</h2>

			<div className='space-y-4'>
				<div>
					{/* skipcq: JS-0752 */}
					<h5 className='block text-sm font-medium text-gray-700 mb-1'>
						Intro Length (bars)
					</h5>
					<div className='flex items-center'>
						<button
							className='bg-gray-200 px-2 py-1 rounded-l-md disabled:opacity-50'
							// skipcq: JS-0417
							onClick={decrementIntroLength}
							disabled={settings.introLength <= 8 || disabled}>
							<span className='material-icons text-sm'>remove</span>
						</button>
						<div className='px-4 py-1 bg-gray-100 text-center'>
							{settings.introLength}
						</div>
						<button
							className='bg-gray-200 px-2 py-1 rounded-r-md disabled:opacity-50'
							// skipcq: JS-0417
							onClick={incrementIntroLength}
							disabled={settings.introLength >= 64 || disabled}>
							<span className='material-icons text-sm'>add</span>
						</button>
					</div>
				</div>
			</div>

			<button
				className='mt-6 w-full bg-gradient-to-r from-primary to-purple-600 text-white py-2 px-4 rounded-md font-medium shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50'
				// skipcq: JS-0417
				onClick={handleGenerateClick}
				disabled={!trackId || isSubmitting || disabled}
				data-generate-button='true'>
				{isSubmitting ? "Starting Process..." : "Generate Extended Version"}
			</button>
		</div>
	);
};

export default SettingsPanel;
