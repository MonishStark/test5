/** @format */

import express, { type Express } from "express";
import { promises as fsPromises } from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfigFn from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(_message: string, _source = "express") {
	//Placeholder logging function - formatted time available if needed
	const formattedTime = new Date().toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	});
}

export async function setupVite(app: Express, server: Server) {
	const serverOptions = {
		middlewareMode: true,
		hmr: { server },
		allowedHosts: ["localhost"],
	};

	const viteConfig = viteConfigFn({ command: "serve", mode: "development" });

	const vite = await createViteServer({
		...viteConfig,
		configFile: false,
		customLogger: {
			...viteLogger,
			error: (msg, options) => {
				viteLogger.error(msg, options);
			},
		},
		server: serverOptions,
		appType: "custom",
	});

	app.use(vite.middlewares);
	app.use("*", async (req, res, next) => {
		const url = req.originalUrl;

		try {
			const clientTemplate = path.resolve(
				import.meta.dirname,
				"..",
				"client",
				"index.html"
			);

			// always reload the index.html file from disk incase it changes
			let template = await fsPromises.readFile(clientTemplate, "utf-8");
			template = template.replace(
				'src="/src/main.tsx"',
				`src="/src/main.tsx?v=${nanoid()}"`
			);
			const page = await vite.transformIndexHtml(url, template);
			res.status(200).set({ "Content-Type": "text/html" }).end(page);
		} catch (e) {
			vite.ssrFixStacktrace(e as Error);
			next(e);
		}
	});
}

export async function serveStatic(app: Express) {
	const distPath = path.resolve(import.meta.dirname, "public");

	try {
		await fsPromises.access(distPath);
	} catch {
		throw new Error(
			`Could not find the build directory: ${distPath}, make sure to build the client first`
		);
	}

	app.use(express.static(distPath));

	// fall through to index.html if the file doesn't exist
	app.use("*", (_req, res) => {
		res.sendFile(path.resolve(distPath, "index.html"));
	});
}
