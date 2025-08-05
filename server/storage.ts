/** @format */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
	users,
	audioTracks,
	type User,
	type InsertUser,
	type AudioTrack,
	type InsertAudioTrack,
	type UpdateAudioTrack,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

// Ensure DATABASE_URL is defined
if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL environment variable is not defined");
}

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export interface IStorage {
	getUser(id: number): Promise<User | undefined>;
	getUserByUsername(username: string): Promise<User | undefined>;
	createUser(user: InsertUser): Promise<User>;
	getAudioTrack(id: number): Promise<AudioTrack | undefined>;
	createAudioTrack(track: InsertAudioTrack): Promise<AudioTrack>;
	updateAudioTrack(
		id: number,
		update: UpdateAudioTrack
	): Promise<AudioTrack | undefined>;
	getAudioTracksByUserId(userId: number): Promise<AudioTrack[]>;
	deleteAudioTrack(id: number): Promise<void>;
	deleteAllUserTracks(userId: number): Promise<void>;
}

export class PostgresStorage implements IStorage {
	// skipcq: JS-0105
	async getUser(id: number): Promise<User | undefined> {
		const result = await db.select().from(users).where(eq(users.id, id));
		return result[0];
	}

	// skipcq: JS-0105
	async getUserByUsername(username: string): Promise<User | undefined> {
		const result = await db
			.select()
			.from(users)
			.where(eq(users.username, username));
		return result[0];
	}

	// skipcq: JS-0105
	async createUser(insertUser: InsertUser): Promise<User> {
		const result = await db.insert(users).values(insertUser).returning();
		return result[0];
	}

	// skipcq: JS-0105
	async getAudioTrack(id: number): Promise<AudioTrack | undefined> {
		const result = await db
			.select()
			.from(audioTracks)
			.where(eq(audioTracks.id, id));
		return result[0];
	}

	// skipcq: JS-0105
	async createAudioTrack(
		insertAudioTrack: InsertAudioTrack
	): Promise<AudioTrack> {
		const result = await db
			.insert(audioTracks)
			.values(insertAudioTrack)
			.returning();
		return result[0];
	}

	// skipcq: JS-0105
	async updateAudioTrack(
		id: number,
		updateAudioTrack: UpdateAudioTrack
	): Promise<AudioTrack | undefined> {
		const result = await db
			.update(audioTracks)
			.set(updateAudioTrack)
			.where(eq(audioTracks.id, id))
			.returning();
		return result[0];
	}

	// skipcq: JS-0105
	async getAudioTracksByUserId(userId: number): Promise<AudioTrack[]> {
		return await db
			.select()
			.from(audioTracks)
			.where(eq(audioTracks.userId, userId))
			.orderBy(desc(audioTracks.id));
	}

	// skipcq: JS-0105
	async deleteAudioTrack(id: number): Promise<void> {
		await db.delete(audioTracks).where(eq(audioTracks.id, id));
	}

	// skipcq: JS-0105
	async deleteAllUserTracks(userId: number): Promise<void> {
		await db.delete(audioTracks).where(eq(audioTracks.userId, userId));
	}
}

export const storage = new PostgresStorage();
