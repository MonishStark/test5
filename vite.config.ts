/** @format */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { visualizer } from "rollup-plugin-visualizer";

// Get directory name for ES modules (equivalent to __dirname in CommonJS)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
	const isProduction = command === "build";

	return {
		plugins: [
			// React plugin for JSX transformation and Fast Refresh during development
			react(),
			// Bundle analyzer for analyzing bundle size
			visualizer({
				filename: "dist/bundle-analysis.html",
				open: false,
				gzipSize: true,
			}),
		],

		resolve: {
			alias: {
				// "@" alias points to client source directory for clean component imports
				// Usage: import Component from "@/components/Component"
				"@": path.resolve(__dirname, "client", "src"),

				// "@shared" alias for shared types and schemas between client and server
				// Usage: import { AudioTrack } from "@shared/schema"
				"@shared": path.resolve(__dirname, "shared"),

				// "@assets" alias for static assets and media files
				// Usage: import logo from "@assets/logo.png"
				"@assets": path.resolve(__dirname, "attached_assets"),
			},
		},

		// esbuild configuration - only drop console statements in production
		esbuild: isProduction
			? {
					drop: ["console", "debugger"],
					pure: ["console.log", "console.info"],
			  }
			: {},

		// Set the root directory to the client folder for frontend development
		// This allows Vite to serve the React application from the correct location
		root: path.resolve(__dirname, "client"),

		// Development server configuration
		server: {
			port: 5173,
			proxy: {
				// Proxy API requests to the backend server
				"/api": {
					target: "http://localhost:5000",
					changeOrigin: true,
					secure: false,
				},
				// Proxy WebSocket connections for real-time updates
				"/socket.io": {
					target: "http://localhost:5000",
					changeOrigin: true,
					ws: true,
				},
			},
		},

		build: {
			// Output directory for production builds
			// Built files will be served by the Express server from this location
			outDir: path.resolve(__dirname, "dist/public"),

			// Clean the output directory before each build
			// Ensures no stale files remain from previous builds
			emptyOutDir: true,

			// Optimize bundle size
			rollupOptions: {
				output: {
					manualChunks: {
						// Separate vendor chunks for better caching
						react: ["react", "react-dom"],
						reactQuery: ["@tanstack/react-query"],
						radixUI: [
							"@radix-ui/react-dialog",
							"@radix-ui/react-dropdown-menu",
							"@radix-ui/react-label",
							"@radix-ui/react-popover",
							"@radix-ui/react-progress",
							"@radix-ui/react-scroll-area",
							"@radix-ui/react-select",
							"@radix-ui/react-separator",
							"@radix-ui/react-slider",
							"@radix-ui/react-slot",
							"@radix-ui/react-switch",
							"@radix-ui/react-tabs",
							"@radix-ui/react-toast",
							"@radix-ui/react-tooltip",
							"@radix-ui/react-alert-dialog",
						],
						icons: ["lucide-react", "react-icons"],
						utils: ["clsx", "class-variance-authority", "tailwind-merge"],
					},
				},
				// Tree shaking optimization
				treeshake: {
					moduleSideEffects: false,
				},
			},

			// Enable minification for production (using esbuild for faster builds)
			minify: "esbuild",

			// Chunk size warnings
			chunkSizeWarningLimit: 600,

			// Enable source maps for debugging in production (optional)
			sourcemap: false,

			// CSS code splitting
			cssCodeSplit: true,

			// Optimize CSS
			cssMinify: true,
		},
	};
});
