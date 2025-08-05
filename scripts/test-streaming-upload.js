/**
 * Streaming Upload Test Script
 *
 * This script tests the streaming upload functionality by:
 * 1. Checking if the streaming endpoints are available
 * 2. Testing upload initialization
 * 3. Verifying health check endpoint
 * 4. Testing progress tracking
 *
 * @format
 */

import fetch from "node-fetch";

// Utility function to sanitize user input for logging
function sanitizeForLog(input) {
	if (typeof input !== "string") {
		input = String(input);
	}
	// Remove newlines, carriage returns, and control characters that could be used for log injection
	return input
		.replace(/[\r\n\t]/gu, "")
		.replace(/[^\x20-\x7E]/gu, "") // skipcq: JS-W1035 - Keep only printable ASCII characters for security
		.substring(0, 1000);
}

const BASE_URL = "http://localhost:5000";

async function testStreamingUpload() {
	console.log("🚀 Testing Streaming Upload Implementation...\n");

	try {
		// Test 1: Health Check
		console.log("1. Testing health check endpoint...");
		const healthResponse = await fetch(`${BASE_URL}/api/streaming/health`);

		if (healthResponse.ok) {
			const healthData = await healthResponse.json();
			console.log("✅ Health check passed");
			console.log(`   Status: ${sanitizeForLog(healthData.status)}`);
			console.log(
				`   Max file size: ${sanitizeForLog(healthData.limits?.maxFileSize)}`
			);
			console.log(
				`   Chunk size: ${sanitizeForLog(healthData.limits?.chunkSize)}`
			);
		} else {
			console.log("❌ Health check failed");
			return;
		}

		// Test 2: Upload Initialization
		console.log("\n2. Testing upload initialization...");
		const initResponse = await fetch(`${BASE_URL}/api/streaming/upload/init`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				filename: "test-large-file.mp3",
				fileSize: 52428800, // 50MB
				contentType: "audio/mpeg",
			}),
		});

		if (initResponse.ok) {
			const initData = await initResponse.json();
			console.log("✅ Upload initialization passed");
			console.log(`   Upload ID: ${sanitizeForLog(initData.uploadId)}`);
			console.log(
				`   Max file size: ${sanitizeForLog(
					Math.round(initData.maxFileSize / (1024 * 1024))
				)}MB`
			);
			console.log(
				`   Chunk size: ${sanitizeForLog(
					Math.round(initData.chunkSize / 1024)
				)}KB`
			);

			// Test 3: Progress Tracking
			console.log("\n3. Testing progress tracking...");
			const progressResponse = await fetch(
				`${BASE_URL}/api/streaming/upload/progress/${initData.uploadId}`
			);

			if (progressResponse.ok) {
				const progressData = await progressResponse.json();
				console.log("✅ Progress tracking passed");
				console.log(`   Status: ${sanitizeForLog(progressData.status)}`);
				console.log(`   Filename: ${sanitizeForLog(progressData.filename)}`);
			} else {
				console.log("❌ Progress tracking failed");
			}

			// Test 4: Active Uploads
			console.log("\n4. Testing active uploads endpoint...");
			const activeResponse = await fetch(
				`${BASE_URL}/api/streaming/upload/active`
			);

			if (activeResponse.ok) {
				const activeData = await activeResponse.json();
				console.log("✅ Active uploads endpoint passed");
				console.log(`   Active uploads: ${sanitizeForLog(activeData.count)}`);
			} else {
				console.log("❌ Active uploads endpoint failed");
			}

			// Cleanup: Cancel the test upload
			console.log("\n5. Cleaning up test upload...");
			const cancelResponse = await fetch(
				`${BASE_URL}/api/streaming/upload/${initData.uploadId}`,
				{
					method: "DELETE",
				}
			);

			if (cancelResponse.ok) {
				console.log("✅ Upload cleanup passed");
			} else {
				console.log("❌ Upload cleanup failed");
			}
		} else {
			console.log("❌ Upload initialization failed");
			const errorData = await initResponse.json();
			console.log(`   Error: ${sanitizeForLog(errorData.message)}`);
		}
	} catch (error) {
		console.log(`❌ Test failed with error: ${sanitizeForLog(error.message)}`);
		console.log("   Make sure the server is running on http://localhost:5000");
	}

	console.log("\n✨ Streaming upload test completed!");
}

// Test file size validation
async function testFileSizeValidation() {
	console.log("\n📏 Testing file size validation...");

	try {
		// Test with file too large (over 500MB)
		const response = await fetch(`${BASE_URL}/api/streaming/upload/init`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				filename: "huge-file.mp3",
				fileSize: 600 * 1024 * 1024, // 600MB - should fail
				contentType: "audio/mpeg",
			}),
		});

		if (response.status === 413) {
			console.log("✅ File size validation working correctly");
			const errorData = await response.json();
			console.log(`   Error message: ${sanitizeForLog(errorData.message)}`);
		} else {
			console.log("❌ File size validation not working properly");
		}
	} catch (error) {
		console.log(
			`❌ File size validation test failed: ${sanitizeForLog(error.message)}`
		);
	}
}

// Test file format validation
async function testFileFormatValidation() {
	console.log("\n🎵 Testing file format validation...");

	try {
		// Test with unsupported file format
		const response = await fetch(`${BASE_URL}/api/streaming/upload/init`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				filename: "test-file.txt",
				fileSize: 1024,
				contentType: "text/plain",
			}),
		});

		if (response.status === 400) {
			console.log("✅ File format validation working correctly");
			const errorData = await response.json();
			console.log(`   Error message: ${sanitizeForLog(errorData.message)}`);
		} else {
			console.log("❌ File format validation not working properly");
		}
	} catch (error) {
		console.log(
			`❌ File format validation test failed: ${sanitizeForLog(error.message)}`
		);
	}
}

// Performance benchmark
async function performanceBenchmark() {
	console.log("\n⚡ Performance Benchmark...");

	const testSizes = [
		{ name: "1MB", size: 1024 * 1024 },
		{ name: "10MB", size: 10 * 1024 * 1024 },
		{ name: "50MB", size: 50 * 1024 * 1024 },
		{ name: "100MB", size: 100 * 1024 * 1024 },
	];

	for (const test of testSizes) {
		try {
			const startTime = Date.now();

			const response = await fetch(`${BASE_URL}/api/streaming/upload/init`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					filename: `test-${test.name.toLowerCase()}.mp3`,
					fileSize: test.size,
					contentType: "audio/mpeg",
				}),
			});

			const endTime = Date.now();
			const duration = endTime - startTime;

			if (response.ok) {
				const data = await response.json();
				console.log(`✅ ${test.name} initialization: ${duration}ms`);

				// Cleanup
				await fetch(`${BASE_URL}/api/streaming/upload/${data.uploadId}`, {
					method: "DELETE",
				});
			} else {
				console.log(`❌ ${test.name} initialization failed`);
			}
		} catch (error) {
			console.log(
				`❌ ${test.name} benchmark failed: ${sanitizeForLog(error.message)}`
			);
		}
	}
}

// Run all tests
async function runAllTests() {
	await testStreamingUpload();
	await testFileSizeValidation();
	await testFileFormatValidation();
	await performanceBenchmark();

	console.log("\n🎉 All streaming upload tests completed!");
	console.log("\n📚 Next Steps:");
	console.log(
		"   1. Try uploading a large file (>15MB) through the web interface"
	);
	console.log("   2. Monitor the real-time progress tracking");
	console.log("   3. Test cancellation and retry functionality");
	console.log(
		"   4. Compare memory usage between standard and streaming uploads"
	);
}

// Execute tests if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	runAllTests().catch(console.error);
}

export {
	testStreamingUpload,
	testFileSizeValidation,
	testFileFormatValidation,
	performanceBenchmark,
};
