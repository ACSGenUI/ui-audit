import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Single-file HTML for the MCP Audit Dashboard (read by mcp-stdio.js buildAuditDashboardContents).
 * root = this directory so the built file is dist/mcp-dashboard/audit-dashboard-mcp.html (flat).
 */
export default defineConfig({
  root: __dirname,
  publicDir: false,
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: resolve(__dirname, '../../dist/mcp-dashboard'),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    sourcemap: false,
    minify: 'esbuild',
    reportCompressedSize: false,
    rollupOptions: {
      input: resolve(__dirname, './audit-dashboard-mcp.html'),
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
