/**
 * MCP dashboard bundle entry: preloads html2pdf so PDF export works under strict CSP (no ui:// script-src).
 * The static HTML page uses audit-dashboard-entry.js instead, which loads html2pdf via script tag when needed.
 */
import '../progen-craft/design-system/utils/html2pdf.bundle.min.js';
import './audit-dashboard-entry.js';
