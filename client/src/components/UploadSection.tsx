/** @format */

import React, { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { logger } from "../../../shared/logger";

/**
 * UploadSection Component
 *
 * A sophisticated file upload interface that handles audio file uploads with drag-and-drop functionality.
 * Features include:
 * - Drag-and-drop file upload with visual feedback
 * - File type validation (audio files only)
 * - Upload progress tracking and status management
 * - Error handling with user-friendly toast notifications
 * - Click-to-upload fallback option
 *
 * The component manages upload state through React hooks and provides visual feedback
 * during the upload process. It validates file types client-side and handles server
 * communication through the apiRequest utility.
 */
interface UploadSectionProps {
	/** Callback function triggered when upload completes successfully with the new track ID */
	onUploadSuccess: (trackId: number) => void;
}

const UploadSection: React.FC<UploadSectionProps> = ({ onUploadSuccess }) => {
	// State management for drag-and-drop visual feedback
	const [isDragActive, setIsDragActive] = useState(false);
	// Upload progress state to show loading indicators
	const [isUploading, setIsUploading] = useState(false);
	// Reference to hidden file input for click-to-upload functionality
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { toast } = useToast();

	/**
	 * Triggers the hidden file input when user clicks the upload area
	 * Provides alternative to drag-and-drop for file selection
	 */
	const handleUploadClick = () => {
		if (fileInputRef.current) {
			fileInputRef.current.click();
		}
	};

	/**
	 * Handles keyboard events for accessibility
	 * Triggers upload on Enter or Space key press
	 */
	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleUploadClick();
		}
	};

	/**
	 * Handles drag over events to provide visual feedback
	 * Prevents default browser behavior and activates drag state
	 */
	const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragActive(true);
	};

	/**
	 * Handles drag leave events to reset visual state
	 * Deactivates drag state when user drags away from drop zone
	 */
	const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragActive(false);
	};

	/**
	 * Core file upload handler with comprehensive validation and error handling
	 *
	 * This function:
	 * 1. Validates file type against allowed audio formats
	 * 2. Creates FormData for multipart upload
	 * 3. Sends file to server via POST request
	 * 4. Handles various error scenarios (file size, type, server errors)
	 * 5. Provides user feedback through toast notifications
	 * 6. Updates loading states during upload process
	 *
	 * @param file - The File object to upload (audio file)
	 */
	const handleFileUpload = async (file: File) => {
		// Client-side file type validation - only allow common audio formats
		const allowedTypes = [
			"audio/mpeg", // MP3
			"audio/wav", // WAV
			"audio/flac", // FLAC
			"audio/aiff", // AIFF
			"audio/x-aiff", // Alternative AIFF MIME type
		];

		if (!allowedTypes.includes(file.type)) {
			toast({
				title: "Invalid file type",
				description: "Please upload an MP3, WAV, FLAC, or AIFF file.",
				variant: "destructive",
			});
			return;
		}

		// Set uploading state to show progress indicators
		setIsUploading(true);

		try {
			// Create FormData for multipart file upload
			const formData = new FormData();
			formData.append("audio", file);

			// Send file to server upload endpoint
			const response = await fetch("/api/tracks/upload", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorData = await response.json();

				// Handle file size exceeded error (413 status)
				if (response.status === 413) {
					// Specific handling for file size exceeded (413 Payload Too Large)
					toast({
						title: "Upload failed",
						description:
							errorData.message ||
							"The uploaded file exceeds the maximum size limit.",
						variant: "destructive",
					});
					return;
				}

				// Handle other server errors with descriptive messages
				throw new Error(errorData.message || "Upload failed");
			}

			// Parse successful response and extract track data
			const data = await response.json();

			// Show success notification to user
			toast({
				title: "Upload successful",
				description: "Your track has been uploaded successfully.",
			});

			// Notify parent component of successful upload with track ID
			onUploadSuccess(data.id);
		} catch (error) {
			logger.uploadError(
				"File upload failed",
				error instanceof Error ? error : new Error(String(error)),
				{ fileName: file.name, fileSize: file.size }
			);

			// Show error notification with appropriate message
			toast({
				title: "Upload failed",
				description:
					(error as Error).message ||
					"An unexpected error occurred during upload.",
				variant: "destructive",
			});
		} finally {
			// Reset upload state and clear file input regardless of outcome
			setIsUploading(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	/**
	 * Handles file drop events and initiates upload process
	 * Extracts the first file from the drop event and processes it
	 */
	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDragActive(false);

		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			handleFileUpload(e.dataTransfer.files[0]);
		}
	};

	/**
	 * Handles file selection from the file input element
	 * Triggered when user selects file through click-to-upload
	 */
	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			handleFileUpload(e.target.files[0]);
		}
	};

	return (
		<div className='bg-white rounded-xl shadow-md p-6'>
			<h2 className='text-xl font-semibold mb-4'>Upload Track</h2>

			{/*
				Interactive drop zone with comprehensive state management:
				- Visual feedback for drag states (active/inactive)
				- Disabled state during upload with opacity reduction
				- Click handler for fallback file selection
				- Drag event handlers for smooth drag-and-drop experience
			*/}
			{/* skipcq: JS-0417, JS-0746 */}
			<div
				// skipcq: JS-0417, JS-0746
				className={`drop-zone p-8 flex flex-col items-center justify-center text-center cursor-pointer ${
					isDragActive ? "active" : ""
				} ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
				onClick={handleUploadClick} // skipcq: JS-0417, JS-0746
				onKeyDown={handleKeyDown} // skipcq: JS-0417
				onDragOver={handleDragOver} // skipcq: JS-0417, JS-0746
				onDragLeave={handleDragLeave} // skipcq: JS-0417, JS-0746
				onDrop={handleDrop} // skipcq: JS-0417, JS-0746
				tabIndex={0} // Make focusable for keyboard navigation
				role='button' // Semantic role for screen readers
				aria-label='Upload audio file by clicking or dragging and dropping'>
				{" "}
				{/* Conditional rendering based on upload state */}
				{isUploading ? (
					// Upload progress state with animated feedback
					<>
						<span className='material-icons text-5xl text-primary-light mb-4 animate-pulse'>
							cloud_upload
						</span>
						<p className='font-medium mb-2'>Uploading...</p>
					</>
				) : (
					// Default upload prompt state with instructions
					<>
						<span className='material-icons text-5xl text-primary-light mb-4'>
							cloud_upload
						</span>
						<p className='font-medium mb-2'>Drag & drop your track here</p>
						<p className='text-sm text-gray-500 mb-4'>or click to browse</p>
						<p className='text-xs text-gray-400'>
							Supports MP3, WAV, FLAC, AIFF
						</p>
					</>
				)}
				{/*
					Hidden file input for click-to-upload functionality
					- Accepts multiple audio file formats through MIME types and extensions
					- Disabled during upload to prevent multiple simultaneous uploads
					- Value cleared after each upload to allow re-uploading same file
				*/}
				<input
					type='file'
					id='file-upload'
					className='hidden'
					accept='.mp3,.wav,.flac,.aiff,audio/mpeg,audio/wav,audio/flac,audio/aiff,audio/x-aiff'
					ref={fileInputRef}
					// skipcq: JS-0417
					onChange={handleFileChange}
					disabled={isUploading}
				/>
			</div>
		</div>
	);
};

export default UploadSection;
