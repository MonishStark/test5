/** @format */

import React, { useState, useEffect } from "react";
import { AudioTrack } from "@shared/schema";
import TrackView from "@/components/TrackView";
import { useQuery } from "@tanstack/react-query";

/**
 * TrackPreview Component
 *
 * A comprehensive track visualization and comparison interface that displays audio tracks
 * in multiple views and states. This component serves as the main track display hub with:
 *
 * Core Features:
 * - Tabbed interface for original vs extended track comparison
 * - Real-time data fetching with React Query for optimal caching
 * - Automatic tab switching based on processing completion
 * - Visual track structure comparison with duration breakdowns
 * - Simulated waveform visualization for both versions
 * - Download functionality for completed extended tracks
 * - Comprehensive empty states for various scenarios
 *
 * State Management:
 * - Active tab state (original, extended, comparison)
 * - Automatic tab transitions during processing lifecycle
 * - Conditional rendering based on track processing status
 *
 * The component adapts its interface based on track availability and processing state,
 * providing appropriate feedback for each phase of the audio processing workflow.
 */
interface TrackPreviewProps {
	/** ID of the track to display, null when no track selected */
	trackId: number | null;
	/** Whether the track processing has completed successfully */
	isProcessed: boolean;
}

const TrackPreview: React.FC<TrackPreviewProps> = ({
	trackId,
	isProcessed,
}) => {
	// Active tab state management for switching between track views
	const [activeTab, setActiveTab] = useState<
		"original" | "extended" | "comparison"
	>("original");

	// React Query for optimized track data fetching with automatic caching
	const { data: track, isLoading } = useQuery<AudioTrack>({
		queryKey: trackId ? [`/api/tracks/${trackId}`] : ["no-track"],
		enabled: Boolean(trackId),
	});

	/**
	 * Reset to original tab when track changes or initially loads
	 * Ensures consistent starting state for new track selections
	 */
	useEffect(() => {
		setActiveTab("original");
	}, [trackId]);

	/**
	 * Automatically switch to extended tab when processing completes
	 * Provides smooth UX by showing results immediately after processing
	 */
	useEffect(() => {
		if (isProcessed) {
			setActiveTab("extended");
		}
	}, [isProcessed]);

	/**
	 * Handle tab navigation with state management
	 * Allows users to switch between different track views
	 */
	const handleTabClick = (tab: "original" | "extended" | "comparison") => {
		setActiveTab(tab);
	};

	/**
	 * Renders contextual empty states for different scenarios
	 * Provides clear guidance when tracks or features are unavailable
	 *
	 * @param type - The type of empty state to render (extended or comparison)
	 */
	const renderEmptyState = (type: string) => (
		<div className='p-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-400'>
			{type === "extended" ? (
				// Empty state for missing extended version
				<>
					<span className='material-icons text-5xl mb-4'>audio_file</span>
					<h3 className='text-lg font-medium mb-2'>No Extended Version Yet</h3>
					<p className='mb-4'>
						Upload a track and generate an extended version to see the results
						here
					</p>
				</>
			) : (
				// Empty state for missing comparison data
				<>
					<span className='material-icons text-5xl mb-4'>compare</span>
					<h3 className='text-lg font-medium mb-2'>No Comparison Available</h3>
					<p className='mb-4'>
						Generate an extended version first to compare with the original
					</p>
				</>
			)}
		</div>
	);
	// skipcq: JS-R1005
	const renderTrackTabs = () => (
		<>
			<div className='border-b border-gray-200 mb-6'>
				<ul className='flex -mb-px'>
					{track?.status === "completed" || track?.status === "regenerate" ? (
						<>
							<li className='mr-4'>
								<button
									className={`inline-block pb-3 px-1 font-medium ${
										activeTab === "original"
											? "text-primary border-b-2 border-primary"
											: "text-gray-500 hover:text-gray-700"
									}`}
									// skipcq: JS-0417
									onClick={() => handleTabClick("original")}>
									Original Track
								</button>
							</li>
							<li className='mr-4'>
								<button
									className={`inline-block pb-3 px-1 font-medium ${
										activeTab === "extended"
											? "text-primary border-b-2 border-primary"
											: track?.status === "completed" ||
											  track?.status === "regenerate"
											? "text-gray-500 hover:text-gray-700"
											: "text-white"
									}`}
									// skipcq: JS-0417
									onClick={() => handleTabClick("extended")}>
									Extended Version
								</button>
							</li>
						</>
					) : (
						<li>
							<button className='inline-block pb-3 px-1 font-medium text-primary border-b-2 border-primary'>
								Original Track
							</button>
						</li>
					)}
				</ul>
			</div>

			<div
				className={`tab-content ${activeTab === "original" ? "" : "hidden"}`}>
				{track && <TrackView track={track} type='original' version={0} />}
			</div>

			<div
				className={`tab-content ${activeTab === "extended" ? "" : "hidden"}`}>
				{isProcessed && track ? (
					<TrackView
						track={track}
						type='extended'
						version={(track.extendedPaths?.length || 1) - 1}
					/>
				) : (
					renderEmptyState("extended")
				)}
			</div>

			<div
				className={`tab-content ${activeTab === "comparison" ? "" : "hidden"}`}>
				{(isProcessed ||
					(track?.extendedPaths?.length && track.extendedPaths.length > 0)) &&
				track ? (
					// skipcq: JS-0415
					<div className='space-y-6'>
						<div>
							<h4 className='font-medium mb-2'>Track Structure Comparison</h4>
							<div className='grid grid-cols-1 gap-3'>
								<div>
									<p className='text-sm font-medium mb-1'>
										Original (
										{track.duration
											? `${Math.floor(track.duration / 60)}:${(
													track.duration % 60
											  )
													.toString()
													.padStart(2, "0")}`
											: "--:--"}
										)
									</p>
									<div className='h-12 w-full bg-gray-100 rounded overflow-hidden flex'>
										<div className='w-4/5 bg-gray-600 flex-shrink-0 flex items-center justify-center text-xs text-white'>
											<span>Main Song</span>
										</div>
										<div className='w-1/5 bg-gray-400 flex-shrink-0 flex items-center justify-center text-xs text-white'>
											<span>Outro</span>
										</div>
									</div>
								</div>
								<div>
									<p className='text-sm font-medium mb-1'>
										Extended (
										{track.extendedDurations?.[
											(track.extendedPaths?.length || 1) - 1
										]
											? `${Math.floor(
													track.extendedDurations[
														(track.extendedPaths?.length || 1) - 1
													] / 60
											  )}:${(
													track.extendedDurations[
														(track.extendedPaths?.length || 1) - 1
													] % 60
											  )
													.toString()
													.padStart(2, "0")}`
											: "--:--"}
										)
									</p>
									<div className='h-12 w-full bg-gray-100 rounded overflow-hidden flex'>
										<div className='w-1/5 bg-primary flex-shrink-0 flex items-center justify-center text-xs text-white'>
											<span>{track.settings?.introLength}-bar Intro</span>
										</div>
										<div className='w-3/5 bg-gray-600 flex-shrink-0 flex items-center justify-center text-xs text-white rounded-sm'>
											<span>Main Song</span>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div>
							<h4 className='font-medium mb-2'>Waveform Comparison</h4>
							<div className='grid grid-cols-1 gap-4'>
								<div>
									<p className='text-sm font-medium mb-1'>Original</p>
									<div className='waveform-container h-20 bg-gray-900 rounded-lg'>
										<div className='waveform'>
											<div className='waveform-bars'>
												{Array(120)
													.fill(0)
													.map((_, i) => (
														<div
															key={`original-waveform-${i}`} // skipcq: JS-0437
															className='waveform-bar bg-gradient-to-t from-primary to-purple-600'
															style={{
																height: `${Math.floor(
																	Math.random() * 70 + 10
																)}px`,
																width: "3px",
																margin: "0 1px",
															}}></div>
													))}
											</div>
										</div>
									</div>
								</div>
								<div>
									<p className='text-sm font-medium mb-1'>Extended</p>
									<div className='waveform-container h-20 bg-gray-900 rounded-lg'>
										<div className='waveform'>
											<div className='waveform-bars'>
												{" "}
												{Array(150)
													.fill(0)
													.map((_, i) => (
														<div
															key={`extended-waveform-${i}`} // skipcq: JS-0437
															className='waveform-bar bg-gradient-to-t from-primary to-purple-600'
															style={{
																height: `${Math.floor(
																	Math.random() * 70 + 10
																)}px`,
																width: "3px",
																margin: "0 1px",
															}}></div>
													))}
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div className='mt-4 flex justify-center'>
							{track && track.status === "completed" && (
								<a
									href={`/api/tracks/${track.id}/download?version=${
										(track.extendedPaths?.length || 1) - 1
									}`}
									className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary'
									download>
									<span className='material-icons text-sm mr-1'>download</span>
									Download Extended Mix
								</a>
							)}
						</div>
					</div>
				) : (
					renderEmptyState("comparison")
				)}
			</div>
		</>
	);

	const renderLoadingState = () => (
		<div className='p-12 flex justify-center items-center'>
			<div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary'></div>
		</div>
	);

	const renderEmptyTrackState = () => (
		<div className='p-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-400'>
			<span className='material-icons text-5xl mb-4'>music_note</span>
			<h3 className='text-lg font-medium mb-2'>No Track Selected</h3>
			<p className='mb-4'>
				Upload a track to see its details and create an extended version
			</p>
		</div>
	);

	return (
		<div className='bg-white rounded-xl shadow-md p-6'>
			<h2 className='text-xl font-semibold mb-4'>Track Preview</h2>

			{isLoading
				? renderLoadingState()
				: !trackId
				? renderEmptyTrackState()
				: renderTrackTabs()}
		</div>
	);
};

export default TrackPreview;
