import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Lets <script lang="ts"> (and PostCSS etc.) work inside .svelte files.
export default {
  preprocess: vitePreprocess(),
};
