/**
 * PostCSS Configuration for Music DJ Feature Application
 *
 * PostCSS processes CSS files during the build process, applying transformations
 * and optimizations to ensure cross-browser compatibility and optimal performance.
 *
 * This configuration integrates with Vite's build system to process CSS files
 * in both development and production environments.
 *
 * @format
 */

export default {
	plugins: {
		/**
		 * Tailwind CSS Plugin
		 *
		 * Processes Tailwind CSS directives (@tailwind base, @tailwind components, @tailwind utilities)
		 * and generates the final CSS output based on the classes used in the application.
		 *
		 * Features:
		 * - Purges unused CSS classes for smaller bundle size
		 * - Applies responsive design utilities
		 * - Processes custom component styles
		 * - Handles CSS variables for theming
		 */
		tailwindcss: {},

		/**
		 * Autoprefixer Plugin
		 *
		 * Automatically adds vendor prefixes to CSS properties based on browser support targets.
		 * Ensures compatibility with older browsers without manual prefix management.
		 *
		 * Features:
		 * - Adds -webkit-, -moz-, -ms- prefixes as needed
		 * - Uses browserslist configuration for target browsers
		 * - Removes outdated prefixes for cleaner code
		 * - Optimizes CSS for better performance
		 *
		 * Browser Support:
		 * - Based on package.json browserslist field or .browserslistrc file
		 * - Defaults to reasonable modern browser support
		 */
		autoprefixer: {},
	},
};
