/** @format */

import { defineConfig } from "drizzle-kit";

/**
 * Drizzle ORM Configuration
 *
 * This configuration file defines how Drizzle Kit manages database schema,
 * migrations, and connections for the Music DJ Feature application.
 *
 * Key Features:
 * - PostgreSQL database integration with type-safe queries
 * - Automatic migration generation from schema changes
 * - Environment-based database credentials
 * - Schema introspection and validation
 *
 * Usage:
 * - `npx drizzle-kit push` - Push schema changes to database
 * - `npx drizzle-kit generate` - Generate migration files
 * - `npx drizzle-kit migrate` - Apply migrations to database
 * - `npx drizzle-kit studio` - Launch database studio for visualization
 */
export default defineConfig({
	// Output directory for generated migration files
	// These files contain SQL commands to update the database schema
	out: "./migrations",

	// Path to the schema definition file containing table structures
	// This file defines all database tables, relationships, and constraints
	schema: "./shared/schema.ts",

	// Database dialect - PostgreSQL for production-grade performance and features
	dialect: "postgresql",

	// Database connection credentials from environment variables
	// Ensures sensitive credentials are not hardcoded in source code
	dbCredentials: {
		// Database server hostname (e.g., localhost, remote server, or cloud provider)
		host:
			process.env.DATABASE_HOST ||
			(() => {
				throw new Error(
					"DATABASE_HOST environment variable is required for database connection"
				);
			})(),

		// Database server port (PostgreSQL default: 5432)
		port: parseInt(process.env.DATABASE_PORT || "5432", 10),

		// Database username with appropriate permissions for schema operations
		user:
			process.env.DATABASE_USER ||
			(() => {
				throw new Error(
					"DATABASE_USER environment variable is required for database connection"
				);
			})(),

		// Database password (should be strong and securely stored)
		password:
			process.env.DATABASE_PASSWORD ||
			(() => {
				throw new Error(
					"DATABASE_PASSWORD environment variable is required for database connection"
				);
			})(),

		// Target database name for the application
		database:
			process.env.DATABASE_NAME ||
			(() => {
				throw new Error(
					"DATABASE_NAME environment variable is required for database connection"
				);
			})(),
	},
});
