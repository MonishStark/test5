/** @format */

// Test localStorage validation logic
function testOldApproach(value) {
	return value ? parseInt(value, 10) : null;
}

function testNewApproach(value) {
	const parsed = value ? parseInt(value, 10) : NaN;
	return !isNaN(parsed) && parsed > 0 ? parsed : null;
}

const testCases = ["123", "-5", "0", "abc", "123abc", "", "null", "undefined"];

console.log("LocalStorage Validation Test:");
console.log("=============================");

testCases.forEach((testValue) => {
	const oldResult = testOldApproach(testValue);
	const newResult = testNewApproach(testValue);
	const secure =
		newResult === null || (typeof newResult === "number" && newResult > 0);
	console.log(
		`Input: '${testValue}' | Old: ${oldResult} | New: ${newResult} | Secure: ${
			secure ? "✓" : "✗"
		}`
	);
});

console.log("\nTheme validation test:");
const validThemes = ["dark", "light", "system"];
const themeTestCases = ["dark", "light", "system", "invalid", "<script>", ""];

themeTestCases.forEach((theme) => {
	const oldResult = theme || "system"; // Old approach
	const newResult = theme && validThemes.includes(theme) ? theme : "system"; // New approach
	const secure = validThemes.includes(newResult);
	console.log(
		`Theme: '${theme}' | Old: '${oldResult}' | New: '${newResult}' | Secure: ${
			secure ? "✓" : "✗"
		}`
	);
});
