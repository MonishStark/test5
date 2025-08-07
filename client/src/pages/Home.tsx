/** @format */

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { logger } from "../../../shared/logger";
import UploadSection from "@/components/UploadSection";
import SettingsPanel from "@/components/SettingsPanel";
import ProcessingInfo from "@/components/ProcessingInfo";
import TrackPreview from "@/components/TrackPreview";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AudioTrack } from "@shared/schema";

const Home: React.FC = () => {
	const { toast } = useToast();
	const [currentTrackId, setCurrentTrackId] = useState<number | null>(() => {
		const saved = localStorage.getItem("currentTrackId");
		const parsed = saved ? parseInt(saved, 10) : NaN;
		return !isNaN(parsed) && parsed > 0 ? parsed : null;
	});
	const [isProcessing, setIsProcessing] = useState(() => {
		return localStorage.getItem("isProcessing") === "true";
	});
	const [isProcessed, setIsProcessed] = useState(() => {
		return localStorage.getItem("isProcessed") === "true";
	});

	const queryClient = useQueryClient();

	// Persist state changes to localStorage
	useEffect(() => {
		if (currentTrackId) {
			localStorage.setItem("currentTrackId", currentTrackId.toString());
		} else {
			localStorage.removeItem("currentTrackId");
		}
	}, [currentTrackId]);

	useEffect(() => {
		localStorage.setItem("isProcessed", isProcessed.toString());
	}, [isProcessed]);

	// Check processing status on initial load
	useEffect(() => {
		const checkInitialStatus = async () => {
			if (currentTrackId && isProcessing) {
				try {
					const response = await fetch(`/api/tracks/${currentTrackId}/status`);
					const data = await response.json();

					if (data.status === "completed") {
						setIsProcessing(false);
						setIsProcessed(true);
						localStorage.setItem("isProcessing", "false");
						localStorage.setItem("isProcessed", "true");
					} else if (
						data.status === "processing" ||
						data.status === "regenerate"
					) {
						setIsProcessing(true);
						localStorage.setItem("isProcessing", "true");
					}
				} catch (error) {
					logger.error(
						"Error checking initial track status",
						error instanceof Error ? error : new Error(String(error)),
						{ trackId: currentTrackId }
					);
				}
			}
		};

		checkInitialStatus();
	}, [currentTrackId]);

	// Persist processing state
	useEffect(() => {
		localStorage.setItem("isProcessing", isProcessing.toString());
	}, [isProcessing]);

	const { data: tracks } = useQuery<AudioTrack[]>({
		queryKey: ["/api/tracks"],
		staleTime: Infinity,
		gcTime: Infinity,
	});

	// Handle track selection when tracks change
	useEffect(() => {
		if (!currentTrackId && tracks && tracks?.length > 0) {
			setCurrentTrackId(tracks[0].id);
			setIsProcessed(tracks[0].status === "completed");
		}
	}, [tracks, currentTrackId]);

	const { data: track } = useQuery<AudioTrack>({
		queryKey: currentTrackId ? [`/api/tracks/${currentTrackId}`] : ["no-track"],
		enabled: Boolean(currentTrackId),
		refetchInterval: isProcessing ? 2000 : false,
	});

	// Check if the track is already processed when loading
	useEffect(() => {
		if (track && track.status === "completed" && track.extendedPaths?.length) {
			setIsProcessed(true);
			setIsProcessing(false);
		}
	}, [track]);

	const handleUploadSuccess = (trackId: number) => {
		setCurrentTrackId(trackId);
		setIsProcessed(false);
	};

	const handleProcessingStart = () => {
		setIsProcessing(true);
	};

	const handleProcessingComplete = () => {
		setIsProcessing(false);
		setIsProcessed(true);
		// Refresh track data to get the latest info
		queryClient.invalidateQueries({
			queryKey: [`/api/tracks/${currentTrackId}`],
		});
	};

	const handleProcessingCancel = () => {
		setIsProcessing(false);
	};

	return (
		<div className='container mx-auto px-4 py-8'>
			<div className='grid grid-cols-1 lg:grid-cols-12 gap-8'>
				{/* Left column: Upload & Controls */}

				<div className='lg:col-span-4 space-y-6'>
					<UploadSection
						onUploadSuccess={handleUploadSuccess} // skipcq: JS-0417
					/>
					{currentTrackId && (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<button className='w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm flex items-center justify-center gap-2'>
									<span className='material-icons text-sm'>delete</span>
									Clear All Tracks
								</button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Clear All Tracks</AlertDialogTitle>
									<AlertDialogDescription>
										Are you sure you want to clear all tracks? This cannot be
										undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										// skipcq: JS-0417
										onClick={async () => {
											try {
												await fetch("/api/tracks", { method: "DELETE" });
												queryClient.invalidateQueries({
													queryKey: ["/api/tracks"],
												});
												setCurrentTrackId(null);
												setIsProcessed(false);
												toast({
													title: "Tracks Cleared",
													description:
														"All tracks have been removed successfully.",
												});
											} catch {
												toast({
													title: "Error",
													description: "Failed to clear tracks.",
													variant: "destructive",
												});
											}
										}}
										className='bg-red-500 hover:bg-red-600'>
										Clear All Tracks
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					)}
					{isProcessing && currentTrackId ? (
						<ProcessingInfo
							trackId={currentTrackId}
							// skipcq: JS-0417
							onComplete={handleProcessingComplete}
							onCancel={handleProcessingCancel} // skipcq: JS-0417
						/>
					) : (
						<SettingsPanel
							trackId={currentTrackId}
							// skipcq: JS-0417
							onProcessingStart={handleProcessingStart}
							disabled={isProcessed}
						/>
					)}
				</div>
				{/* Right column: Results & Preview */}
				<div className='lg:col-span-8'>
					<TrackPreview trackId={currentTrackId} isProcessed={isProcessed} />
				</div>
			</div>
		</div>
	);
};

export default Home;
