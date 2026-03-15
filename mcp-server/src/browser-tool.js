import config from './config.js';
import { resolve } from 'path';
import { writeFile, mkdir } from 'fs/promises';

let puppeteer;
try {
  puppeteer = await import('puppeteer');
} catch {
  puppeteer = null;
}

class BrowserTool {
  constructor() {
    this.browser = null;
  }

  async _ensureBrowser() {
    if (!puppeteer) throw new Error('Puppeteer not installed');
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  async execute(actions) {
    if (!Array.isArray(actions) || actions.length === 0) {
      return { ok: false, error: 'INVALID_ACTIONS', message: 'actions must be a non-empty array' };
    }

    const browser = await this._ensureBrowser();
    const page = await browser.newPage();
    const results = [];
    const artifacts = [];

    try {
      for (const action of actions) {
        const { type, ...params } = action;
        let result;

        switch (type) {
          case 'navigate': {
            await page.goto(params.url, { waitUntil: 'networkidle2', timeout: 30000 });
            result = { type: 'navigate', url: params.url, status: 'ok' };
            break;
          }
          case 'waitForSelector': {
            await page.waitForSelector(params.selector, { timeout: params.timeout || 10000 });
            result = { type: 'waitForSelector', selector: params.selector, found: true };
            break;
          }
          case 'getAttribute': {
            const value = await page.$eval(params.selector, (el, attr) => el.getAttribute(attr), params.attribute);
            result = { type: 'getAttribute', selector: params.selector, attribute: params.attribute, value };
            break;
          }
          case 'getTextContent': {
            const text = await page.$eval(params.selector, el => el.textContent?.trim());
            result = { type: 'getTextContent', selector: params.selector, text };
            break;
          }
          case 'click': {
            await page.click(params.selector);
            result = { type: 'click', selector: params.selector, status: 'ok' };
            break;
          }
          case 'screenshot': {
            const name = params.name || `screenshot-${Date.now()}.png`;
            const artifactPath = resolve(config.artifactsDir, name);
            await mkdir(config.artifactsDir, { recursive: true });
            await page.screenshot({ path: artifactPath, fullPage: params.fullPage ?? false });
            const relPath = `artifacts/${name}`;
            artifacts.push(relPath);
            result = { type: 'screenshot', path: relPath };
            break;
          }
          case 'evaluate': {
            const evalResult = await page.evaluate(params.expression);
            result = { type: 'evaluate', value: evalResult };
            break;
          }
          case 'querySelectorAll': {
            const count = await page.$$eval(params.selector, els => els.length);
            result = { type: 'querySelectorAll', selector: params.selector, count };
            break;
          }
          case 'getComputedStyle': {
            const style = await page.$eval(
              params.selector,
              (el, prop) => window.getComputedStyle(el).getPropertyValue(prop),
              params.property
            );
            result = { type: 'getComputedStyle', selector: params.selector, property: params.property, value: style };
            break;
          }
          default:
            result = { type, error: `Unknown action type: ${type}` };
        }

        results.push(result);
      }

      return { ok: true, results, artifacts };
    } catch (err) {
      // Capture failure screenshot
      let failScreenshot = null;
      try {
        const name = `failure-${Date.now()}.png`;
        const artifactPath = resolve(config.artifactsDir, name);
        await mkdir(config.artifactsDir, { recursive: true });
        await page.screenshot({ path: artifactPath, fullPage: true });
        failScreenshot = `artifacts/${name}`;
        artifacts.push(failScreenshot);
      } catch { /* ignore screenshot failure */ }

      return {
        ok: false,
        error: 'BROWSER_ERROR',
        message: err.message,
        partialResults: results,
        failureScreenshot: failScreenshot,
        artifacts,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

export default BrowserTool;
