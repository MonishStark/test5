/**
 * Database migration runner for applying indexes and optimizations
 * Run this script to apply database optimizations to the audio_tracks table
 *
 * @format
 */

import { Pool } from "pg";
import { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path"; // skipcq: JS-0232

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
import dotenv from "dotenv";
dotenv.config();

async function runMigration() {
	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
	});

	try {
		console.log("🔄 Connecting to database...");
		const client = await pool.connect();

		try {
			console.log("📄 Reading migration file...");
			const migrationPath = path.join(
				__dirname,
				"..",
				"migrations",
				"001_add_indexes_and_optimize.sql"
			);
			console.log("Migration path:", migrationPath);

			// Check if migration file exists and read it asynchronously
			// skipcq: JS-0119
			let migrationSQL;
			try {
				migrationSQL = await fsPromises.readFile(migrationPath, "utf8");
			} catch {
				throw new Error(`Migration file not found at: ${migrationPath}`);
			}

			console.log("Migration SQL length:", migrationSQL.length);

			if (migrationSQL.length === 0) {
				throw new Error("Migration file is empty");
			}

			console.log("🚀 Applying database optimizations...");
			await client.query(migrationSQL);

			console.log("✅ Migration completed successfully!");
			console.log("📊 Database indexes and optimizations have been applied.");
		} finally {
			client.release();
		}
		client.release();
	} catch (error) {
		console.error("❌ Migration failed:", error.message);
		console.error("Stack trace:", error.stack);
	} finally {
		console.log("🔄 Closing database connection...");
		await pool.end();
	}
}

// ES module equivalent of require.main === module
import { pathToFileURL } from "url"; // skipcq: JS-0232

console.log("Script URL:", import.meta.url);
console.log("Process argv[1]:", process.argv[1]);
console.log("Expected URL:", pathToFileURL(process.argv[1]).href);

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	console.log("Running migration...");
	runMigration();
} else {
	console.log("Not running as main module");
}

export { runMigration };
