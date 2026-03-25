/**
 * Dashboard bootstrap: load order matters — i18n and metrics register globals before the app runs.
 */
import './audit-dashboard-i18n.js';
import './audit-dashboard-metrics.js';
import './audit-dashboard.js';
