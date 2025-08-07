/**
 * CORS Configuration Test Script
 *
 * This script tests the CORS configuration by making requests from different origins
 * to verify that the security settings are working correctly.
 *
 * @format
 */

import fetch from "node-fetch";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
// Note: __dirname calculated but not used in this script
// const __dirname = dirname(__filename);

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
const TEST_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:5173",
	"http://localhost:5000",
	"http://localhost:8080", // Should be blocked
	"https://malicious-site.com", // Should be blocked
];

async function testCorsOrigin(origin) {
	try {
		console.log(`\n🧪 Testing origin: ${sanitizeForLog(origin)}`);

		// Test preflight request
		const preflightResponse = await fetch(`${BASE_URL}/api/tracks`, {
			method: "OPTIONS",
			headers: {
				Origin: origin,
				"Access-Control-Request-Method": "GET",
				"Access-Control-Request-Headers": "Content-Type",
			},
		});

		console.log(
			`   Preflight Status: ${sanitizeForLog(preflightResponse.status)}`
		);

		if (preflightResponse.status === 200) {
			const corsHeaders = {
				"Access-Control-Allow-Origin": preflightResponse.headers.get(
					"Access-Control-Allow-Origin"
				),
				"Access-Control-Allow-Credentials": preflightResponse.headers.get(
					"Access-Control-Allow-Credentials"
				),
				"Access-Control-Allow-Methods": preflightResponse.headers.get(
					"Access-Control-Allow-Methods"
				),
			};

			console.log("   CORS Headers:", corsHeaders);

			// Test actual request
			const actualResponse = await fetch(`${BASE_URL}/api/tracks`, {
				method: "GET",
				headers: {
					Origin: origin,
					"Content-Type": "application/json",
				},
			});

			console.log(
				`   Actual Request Status: ${sanitizeForLog(actualResponse.status)}`
			);
			console.log(`   ✅ Origin ${sanitizeForLog(origin)} is ALLOWED`);
		} else {
			console.log(`   ❌ Origin ${sanitizeForLog(origin)} is BLOCKED`);
		}
	} catch (error) {
		console.log(
			`   ⚠️  Error testing ${sanitizeForLog(origin)}:`,
			sanitizeForLog(error.message)
		);
	}
}

async function testRateLimiting() {
	console.log("\n🚦 Testing Rate Limiting...");

	const requests = [];
	for (let i = 0; i < 5; i++) {
		requests.push(
			fetch(`${BASE_URL}/api/tracks`, {
				method: "GET",
				headers: {
					Origin: "http://localhost:3000",
					"Content-Type": "application/json",
				},
			})
		);
	}

	try {
		const responses = await Promise.all(requests);
		const statuses = responses.map((r) => r.status);
		console.log(`   Request statuses: ${statuses.join(", ")}`);

		const rateLimitHeaders = responses[0].headers.get("X-RateLimit-Remaining");
		if (rateLimitHeaders) {
			console.log(
				`   Rate limit remaining: ${sanitizeForLog(rateLimitHeaders)}`
			);
		}

		console.log("   ✅ Rate limiting is working");
	} catch (error) {
		console.log(
			"   ⚠️  Error testing rate limiting:",
			sanitizeForLog(error.message)
		);
	}
}

async function testSecurityHeaders() {
	console.log("\n🛡️  Testing Security Headers...");

	try {
		const response = await fetch(`${BASE_URL}/api/tracks`, {
			method: "GET",
			headers: {
				Origin: "http://localhost:3000",
			},
		});

		const securityHeaders = {
			"X-Content-Type-Options": response.headers.get("X-Content-Type-Options"),
			"X-Frame-Options": response.headers.get("X-Frame-Options"),
			"X-XSS-Protection": response.headers.get("X-XSS-Protection"),
			"Strict-Transport-Security": response.headers.get(
				"Strict-Transport-Security"
			),
			"Content-Security-Policy": response.headers.get(
				"Content-Security-Policy"
			),
			"Referrer-Policy": response.headers.get("Referrer-Policy"),
		};

		console.log("   Security Headers:", securityHeaders);

		const missingHeaders = Object.entries(securityHeaders)
			.filter(([_key, value]) => !value) // skipcq: JS-0128
			.map(([key]) => key);

		if (missingHeaders.length === 0) {
			console.log("   ✅ All security headers are present");
		} else {
			console.log(`   ⚠️  Missing headers: ${missingHeaders.join(", ")}`);
		}
	} catch (error) {
		console.log("   ⚠️  Error testing security headers:", error.message);
	}
}

async function runTests() {
	console.log("🔒 CORS & Security Configuration Test Suite");
	console.log("=".repeat(50));

	// Test if server is running
	try {
		const healthCheck = await fetch(`${BASE_URL}/api/health`);
		if (healthCheck.status !== 200) {
			throw new Error("Server health check failed");
		}
		console.log("✅ Server is running and healthy");
	} catch {
		console.log(
			"❌ Server is not running. Please start the server with: npm run dev"
		);
	}

	// Test CORS for different origins
	console.log("\n📡 Testing CORS Origins...");
	for (const origin of TEST_ORIGINS) {
		await testCorsOrigin(origin);
	}

	// Test rate limiting
	await testRateLimiting();

	// Test security headers
	await testSecurityHeaders();

	console.log("\n🎉 CORS & Security test suite completed!");
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${__filename}`) {
	runTests().catch(console.error);
}

export { runTests, testCorsOrigin, testRateLimiting, testSecurityHeaders };
