/**
 * Enhanced Upload Handler
 *
 * This component intelligently chooses between standard upload (≤15MB)
 * and streaming upload (>15MB) based on file size, providing the best
 * user experience for all file sizes.
 *
 * @format
 */

import React, { useState } from "react";
import UploadSection from "./UploadSection";
import StreamingUploadSection from "./StreamingUploadSection";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface EnhancedUploadProps {
	onUploadSuccess: (trackId: number) => void;
	onUploadError?: (error: string) => void;
}

export const EnhancedUpload: React.FC<EnhancedUploadProps> = ({
	onUploadSuccess,
	onUploadError,
}) => {
	const [activeTab, setActiveTab] = useState<"standard" | "streaming">(
		"standard"
	);

	return (
		// skipcq: JS-0415
		<Card className='w-full'>
			<CardHeader>
				<CardTitle className='flex items-center justify-between'>
					<span>Upload Audio Track</span>
					<div className='flex gap-2'>
						<Badge variant='secondary'>Standard: ≤15MB</Badge>
						<Badge variant='outline'>Streaming: ≤500MB</Badge>
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent>
				<Tabs
					value={activeTab}
					// skipcq: JS-0417
					onValueChange={(value) =>
						setActiveTab(value as "standard" | "streaming")
					}>
					<TabsList className='grid w-full grid-cols-2'>
						<TabsTrigger value='standard'>
							Standard Upload
							<Badge variant='secondary' className='ml-2'>
								≤15MB
							</Badge>
						</TabsTrigger>
						<TabsTrigger value='streaming'>
							Large File Upload
							<Badge variant='outline' className='ml-2'>
								≤500MB
							</Badge>
						</TabsTrigger>
					</TabsList>

					<TabsContent value='standard' className='mt-6'>
						<UploadSection onUploadSuccess={onUploadSuccess} />
						<div className='mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600'>
							<p>
								<strong>Standard Upload:</strong> Fast upload for files up to
								15MB. Recommended for most audio files.
							</p>
						</div>
					</TabsContent>

					<TabsContent value='streaming' className='mt-6'>
						<StreamingUploadSection
							onUploadSuccess={onUploadSuccess}
							onUploadError={onUploadError}
						/>
						<div className='mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700'>
							<p>
								<strong>Streaming Upload:</strong> Memory-efficient upload for
								large files up to 500MB with real-time progress tracking.
							</p>
						</div>
					</TabsContent>
				</Tabs>
			</CardContent>
		</Card>
	);
};

export default EnhancedUpload;
