/** @format */

import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

export default [
	// Base JavaScript rules
	js.configs.recommended,

	// TypeScript files configuration
	{
		files: ["**/*.{ts,tsx,js}"],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
				ecmaFeatures: {
					jsx: true,
				},
			},
		},
		plugins: {
			"@typescript-eslint": typescript,
		},
		rules: {
			// TypeScript specific rules
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					destructuredArrayIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-non-null-assertion": "warn",
			"@typescript-eslint/no-var-requires": "error",
			"@typescript-eslint/ban-ts-comment": "warn",
			"@typescript-eslint/no-empty-function": "warn",

			// Security-related rules (built-in)
			"no-eval": "error",
			"no-implied-eval": "error",
			"no-new-func": "error",
			"no-script-url": "error",

			// General JavaScript rules
			"no-console": "warn",
			"no-debugger": "error",
			"no-alert": "warn",
			"no-var": "error",
			"prefer-const": "error",
			"no-unused-vars": "off", // Handled by TypeScript rule
			"no-undef": "off", // TypeScript handles this
			eqeqeq: ["error", "always"],
			"no-self-compare": "error",
			"no-sequences": "error",
			"no-throw-literal": "error",
			"no-useless-call": "error",
			"no-useless-concat": "error",
			"no-useless-escape": "error",
			"no-void": "error",
			"no-with": "error",
			radix: "error",
			yoda: "error",

			// Style rules
			"array-bracket-spacing": ["error", "never"],
			"block-spacing": "error",
			"brace-style": ["error", "1tbs", { allowSingleLine: true }],
			"comma-spacing": ["error", { before: false, after: true }],
			"comma-style": ["error", "last"],
			"computed-property-spacing": ["error", "never"],
			"func-call-spacing": ["error", "never"],
			"key-spacing": ["error", { beforeColon: false, afterColon: true }],
			"keyword-spacing": "error",
			"no-trailing-spaces": "error",
			"object-curly-spacing": ["error", "always"],
			semi: ["error", "always"],
			"space-before-blocks": "error",
			"space-infix-ops": "error",
			quotes: ["error", "double", { avoidEscape: true }],

			// Performance and best practices
			"no-loop-func": "error",
			"no-new-wrappers": "error",
			"no-array-constructor": "error",
			"no-new-object": "error",
			"no-extend-native": "error",
			"no-proto": "error",
			"no-iterator": "error",
			"no-caller": "error",
			"guard-for-in": "error",
		},
	},

	// Client-side specific configuration
	{
		files: ["client/**/*.{ts,tsx}"],
		languageOptions: {
			globals: {
				window: "readonly",
				document: "readonly",
				localStorage: "readonly",
				sessionStorage: "readonly",
				fetch: "readonly",
				HTMLElement: "readonly",
				Event: "readonly",
			},
		},
		rules: {
			// Browser-specific security rules
			"no-console": "warn", // Allow console in development
		},
	},

	// Server-side specific configuration
	{
		files: ["server/**/*.{js,ts}", "scripts/**/*.{js,ts}"],
		languageOptions: {
			globals: {
				process: "readonly",
				global: "readonly",
				Buffer: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				module: "readonly",
				require: "readonly",
				exports: "readonly",
				console: "readonly",
			},
		},
		rules: {
			// Node.js specific rules
			"no-process-exit": "warn",
			"no-sync": "warn",
			"no-console": "off", // Console allowed in server code
		},
	},

	// Test files configuration (if any)
	{
		files: ["**/*.test.{js,ts,tsx}", "**/*.spec.{js,ts,tsx}"],
		rules: {
			"no-console": "off",
			"@typescript-eslint/no-explicit-any": "off",
		},
	},

	// Configuration files
	{
		files: ["*.config.{js,ts}", "*.config.*.{js,ts}"],
		rules: {
			"no-console": "off",
			"@typescript-eslint/no-var-requires": "off",
		},
	},

	// Ignore patterns
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"build/**",
			"coverage/**",
			"*.min.js",
			"venv310/**",
			"pretrained_models/**",
			"uploads/**",
			"results/**",
			"*.log",
		],
	},
];
