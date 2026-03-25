/**
 * Side-effect module: must load before @modelcontextprotocol/ext-apps and the dashboard.
 *
 * Zod v4 (pulled in by ext-apps) uses a `new Function("")` probe when JIT is on, which strict
 * MCP iframe CSP reports as script-src eval even when caught. jitless mode disables JIT and
 * skips that probe (see zod/v4/core/schemas.js + util.js `allowsEval`).
 */
import { config as zodCoreConfig } from 'zod/v4/core';

zodCoreConfig({ jitless: true });

globalThis.__AUDIT_USE_PRINT_FOR_PDF__ = true;
