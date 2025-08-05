/** @format */

// Test database connection
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

async function testConnection() {
	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
	});

	try {
		console.log("🔄 Testing database connection...");
		const client = await pool.connect();
		console.log("✅ Database connection successful!");
		client.release();
	} catch (error) {
		console.error("❌ Database connection failed:", error.message);
	} finally {
		await pool.end();
	}
}

testConnection();
