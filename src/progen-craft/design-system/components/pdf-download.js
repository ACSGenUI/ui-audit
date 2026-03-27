/**
 * PDF export control: loads html2pdf, captures a target element, shows loading state.
 * @param {HTMLElement} container - Mount point (empty or host clears first).
 * @param {{
 *   scriptUrl?: string,
 *   targetSelector?: string,
 *   getFilenameBase?: () => string,
 *   bodyExportClass?: string,
 *   pdfOptions?: object,
 *   t?: (key: string, vars?: object) => string,
 *   onError?: (err: Error) => void,
 *   printFallback?: boolean,
 * }} config
 * @returns {{ root: HTMLElement, destroy: () => void }}
 */
export function createPdfDownloadControl(container, config) {
  if (!container || !config) {
    throw new Error('createPdfDownloadControl: container and config are required');
  }
  var scriptUrl = config.scriptUrl != null ? config.scriptUrl : '';
  var targetSelector = config.targetSelector || '#dashboard';
  var bodyExportClass = config.bodyExportClass || 'pdf-export-mode';
  var mergePdfOptions = config.pdfOptions || {};
  var printFallback = config.printFallback === true;
  var t =
    config.t ||
    function (k) {
      return k;
    };
  var onError =
    config.onError ||
    function (err) {
      console.error(err);
    };

  var wrap = document.createElement('div');
  wrap.className = 'pc-pdf-download';
  wrap.setAttribute('aria-busy', 'false');

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pc-pdf-download__btn';
  btn.setAttribute('aria-label', t('pdf.downloadAria'));

  var spin = document.createElement('span');
  spin.className = 'pc-pdf-download__spinner';
  spin.setAttribute('aria-hidden', 'true');
  spin.hidden = true;

  var icon = document.createElement('span');
  icon.className = 'pc-pdf-download__btn-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  var btnLabel = document.createElement('span');
  btnLabel.className = 'pc-pdf-download__btn-label';
  btnLabel.textContent = t('pdf.download');

  btn.appendChild(spin);
  btn.appendChild(icon);
  btn.appendChild(btnLabel);

  var status = document.createElement('span');
  status.className = 'pc-pdf-download__status';
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  wrap.appendChild(btn);
  wrap.appendChild(status);
  container.appendChild(wrap);

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      if (typeof globalThis.html2pdf === 'function') {
        resolve();
        return;
      }
      var urlStr = url != null ? String(url).trim() : '';
      if (!urlStr) {
        reject(new Error('html2pdf is not available and no script URL was provided'));
        return;
      }
      if (/^ui:/i.test(urlStr)) {
        reject(
          new Error(
            'html2pdf cannot load from ui: URLs under CSP. Use a dashboard bundle that includes the library.'
          )
        );
        return;
      }
      var existing = document.querySelector('script[data-pc-html2pdf="1"]');
      if (existing) {
        var waits = 0;
        var id = setInterval(function () {
          if (typeof globalThis.html2pdf === 'function') {
            clearInterval(id);
            resolve();
          } else if (++waits > 400) {
            clearInterval(id);
            reject(new Error('html2pdf load timeout'));
          }
        }, 25);
        return;
      }
      var s = document.createElement('script');
      s.src = urlStr;
      s.async = true;
      s.dataset.pcHtml2pdf = '1';
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Failed to load html2pdf from ' + urlStr));
      };
      document.head.appendChild(s);
    });
  }

  function resolveFilenameBase() {
    if (typeof config.getFilenameBase === 'function') {
      var base = String(config.getFilenameBase() || '').trim();
      if (base) return base;
    }
    return 'audit_report';
  }

  btn.addEventListener('click', function () {
    if (wrap.getAttribute('aria-busy') === 'true') return;

    if (printFallback) {
      document.body.classList.add(bodyExportClass);
      status.hidden = false;
      status.textContent = t('pdf.printHint');
      requestAnimationFrame(function () {
        try {
          window.print();
        } catch (printErr) {
          onError(printErr instanceof Error ? printErr : new Error(String(printErr)));
        }
        document.body.classList.remove(bodyExportClass);
        status.textContent = '';
        status.hidden = true;
      });
      return;
    }

    wrap.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    btn.classList.add('pc-pdf-download__btn--loading');
    spin.hidden = false;
    status.hidden = false;
    status.textContent = t('pdf.preparing');
    document.body.classList.add(bodyExportClass);

    var run = function () {
      return loadScript(scriptUrl).then(function () {
        if (typeof globalThis.html2pdf !== 'function') {
          throw new Error('html2pdf is not available after load');
        }
        var element = document.querySelector(targetSelector);
        if (!element) {
          throw new Error('PDF target not found: ' + targetSelector);
        }
        var baseName = resolveFilenameBase().replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'audit_report';
        var fileName = baseName.endsWith('.pdf') ? baseName : baseName + '.pdf';
        var defaults = {
          margin: [10, 0, 10, 0],
          filename: fileName,
          image: { type: 'jpeg', quality: 1 },
          html2canvas: {
            scale: 3,
            useCORS: true,
            letterRendering: true,
            logging: false,
            windowWidth: 1100,
            x: 0,
            y: 0,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        };
        var options = Object.assign({}, defaults, mergePdfOptions);
        if (options.filename && !String(options.filename).toLowerCase().endsWith('.pdf')) {
          options.filename += '.pdf';
        }
        var saveResult = globalThis.html2pdf().set(options).from(element).save();
        return Promise.resolve(saveResult);
      });
    };

    var failed = false;
    run()
      .catch(function (err) {
        failed = true;
        onError(err);
        status.textContent = t('pdf.error');
        status.hidden = false;
      })
      .then(function () {
        document.body.classList.remove(bodyExportClass);
        spin.hidden = true;
        btn.classList.remove('pc-pdf-download__btn--loading');
        btn.disabled = false;
        wrap.setAttribute('aria-busy', 'false');
        if (!failed) {
          status.textContent = '';
          status.hidden = true;
        }
      });
  });

  return {
    root: wrap,
    destroy: function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    },
  };
}
