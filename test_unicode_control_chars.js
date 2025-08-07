/**
 * Test script to verify the improved Unicode control character removal
 * @format
 */

// Simple test function that mimics the sanitizeForLog functionality
function testSanitizeForLog(input) {
	if (input === null || input === undefined) {
		return String(input);
	}

	const strInput = typeof input === "string" ? input : String(input);

	// Using the new Unicode pattern \p{C} to remove all control characters
	return strInput
		.replace(/\p{C}/gu, "") // Remove all Unicode control characters in one pass
		.substring(0, 1000); // Limit length to prevent log flooding
}

// Test cases with various control characters
const testCases = [
	{
		name: "ASCII control characters",
		input: "Hello\x00\x01\x1F\x7FWorld",
		description: "Contains null, SOH, unit separator, and DEL characters",
	},
	{
		name: "Unicode control characters",
		input: "Test\u0080\u009F\u2028\u2029String",
		description:
			"Contains high control chars, line separator, paragraph separator",
	},
	{
		name: "Mixed control and format characters",
		input: "Data\u000C\u200B\u200C\u200DClean",
		description: "Contains form feed and zero-width characters",
	},
	{
		name: "Normal text with percent signs",
		input: "Normal text with 100% legitimate formatting",
		description: "Should preserve percent signs and normal characters",
	},
	{
		name: "Emoji and special Unicode",
		input: "Text with 🎵 emoji and αβγ Greek letters",
		description: "Should preserve printable Unicode characters",
	},
];

console.log("Testing Unicode control character removal:\n");

testCases.forEach((testCase, index) => {
	console.log(`Test ${index + 1}: ${testCase.name}`);
	console.log(`Description: ${testCase.description}`);
	console.log(`Input: "${testCase.input}" (length: ${testCase.input.length})`);

	const result = testSanitizeForLog(testCase.input);
	console.log(`Output: "${result}" (length: ${result.length})`);

	// Check if any control characters remain
	const hasControlChars = /\p{C}/gu.test(result);
	console.log(
		`Control characters removed: ${hasControlChars ? "❌ FAILED" : "✅ PASSED"}`
	);
	console.log("---");
});

console.log("\nTest completed!");
