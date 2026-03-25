/**
 * MCP dashboard bundle: do not import html2pdf here — its webpack bundle uses Function("return this")(),
 * which strict MCP iframe CSP (script-src without unsafe-eval) blocks. PDF uses print fallback instead.
 * Static audit-dashboard.html loads html2pdf via script when needed.
 */
import './audit-dashboard-mcp-flags.js';
import './audit-dashboard-mcp.css';
import './audit-dashboard-entry.js';
import './audit-dashboard-mcp-host.js';
