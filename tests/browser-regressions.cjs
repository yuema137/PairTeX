// NODE_PATH=/path/to/node_modules node tests/browser-regressions.cjs
const { chromium } = require('playwright');
const { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

const converter = `window.MathJax = { startup: { promise: Promise.resolve() },
  tex2mmlPromise: async source => source.includes('custom')
    ? '<math><merror>Unknown macro</merror></math>'
    : '<math data-converted="true"><mi>x</mi></math>',
  typesetPromise: async () => {} };`;

(async () => {
  const project = mkdtempSync(join(tmpdir(), 'pairtex-regressions-'));
  const html = join(project, 'main.html');
  const formula = (id, source, math) => `<span id="${id}" data-editable="math" data-source-file="main.tex" data-math-source="${source}"><span class="math-render">${math}</span></span>`;
  writeFileSync(join(project, 'main.tex'), 'Synthetic source');
  writeFileSync(html, '<p>Review this text.</p><p>'
    + formula('inline', 'x', '<math><mi>x</mi></math>') + '</p><p>'
    + formula('fraction', '\\frac{x}{2}', '<math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>') + '</p><p>'
    + formula('custom', '\\custom', '<math><mi>Q</mi></math>') + '</p>'
    + '<span id="unmapped" data-source-mapping="unmapped"><math><mi>Z</mi></math></span>');
  const server = spawn(process.env.PYTHON || 'python3', [resolve('pairtex.py'), '--project', project, '--html', html, '--port', '0']);
  let browser;
  try {
    const url = await new Promise((res, rej) => {
      server.stdout.on('data', data => { const m = String(data).match(/http:\/\/[^\s]+/); if (m) res(m[0]); });
      server.on('error', rej); server.on('exit', code => rej(new Error(`Server exited: ${code}`)));
    });
    browser = await chromium.launch(process.env.PAIRTEX_BROWSER_CHANNEL ? {channel: process.env.PAIRTEX_BROWSER_CHANNEL} : {});
    for (const mode of ['blocked', 'success', 'delayed']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      console.log(`Checking math: ${mode}`);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let release;
      const gate = new Promise(res => { release = res; });
      await page.route('**/mathjax@3/**', async route => {
        if (mode === 'blocked') return route.abort();
        if (mode === 'delayed') await gate;
        await route.fulfill({contentType: 'application/javascript', body: converter});
      });
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator('#paper #inline math').waitFor();
      if (mode !== 'success') {
        await page.locator('#math-status').waitFor({state: 'visible'});
        // Width/height and visible tokens matter: counts alone miss blank MathML.
        for (const id of ['inline', 'fraction', 'custom']) {
          const bounds = await page.locator(`#paper #${id} math`).boundingBox();
          assert(bounds.width > 0 && bounds.height > 0, `${mode}: ${id} must be visible`);
        }
        assert.equal(await page.locator('#paper #fraction mi').textContent(), 'x');
        assert.equal(await page.locator('#paper #fraction mn').textContent(), '2');
      }
      if (mode === 'delayed') release();
      if (mode !== 'blocked') {
        await page.locator('#paper #inline math[data-converted]').waitFor();
        await page.locator('#math-status').waitFor({state: 'hidden'});
      }
      assert.equal(await page.locator('#paper #custom math').textContent(), 'Q');
      assert.equal(await page.locator('#paper #unmapped').getAttribute('data-editable'), null);
      if (mode === 'blocked') {
        await page.locator('#paper #unmapped').click();
        assert.equal(await page.locator('#math-dialog').isVisible(), false);
        await page.locator('[data-mode="review"]').click();
        await page.locator('#paper #unmapped mi').evaluate(node => {
          const range = document.createRange(); range.selectNodeContents(node.firstChild);
          const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
          node.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, composed: true}));
        });
        await page.locator('[data-action="comment"]').click();
        await page.locator('#message').fill('unmapped formula');
        await page.locator('#save-entry').click();
        await page.locator('#entry-dialog').waitFor({state: 'hidden'});
        const entries = readdirSync(join(project, '.pairtex/feedback')).map(name => JSON.parse(readFileSync(join(project, '.pairtex/feedback', name))));
        assert.equal(entries[0].anchor.source_mapping, 'unmapped');
        assert.equal(entries[0].anchor.file_hint, null);
        assert.equal(entries[0].anchor.selected_source_text, null);
        assert.equal(await page.evaluate(id => state.targetByEntryId.get(id)?.id, entries[0].id), 'unmapped');
        await page.locator('[data-entry-action="locate"]').first().click();
        assert.equal(await page.locator('#paper #unmapped').evaluate(node => node.classList.contains('is-focused')), true);
      }
      await page.locator('#mapping-status').waitFor({state: 'visible'});
      assert.deepEqual(errors, []);
      await context.close();
    }
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.route('**/mathjax@3/**', route => route.abort());
    await page.goto(url);
    const git = (...args) => execFileSync('git', ['-C', project, ...args]);
    async function checkState(status, label, dirty, head) {
      console.log(`Checking Git: ${status}`);
      await page.locator('#refresh-view').click();
      await page.waitForFunction(() => !document.querySelector('#refresh-view').disabled);
      await page.waitForFunction(label => document.querySelector('#version-status').textContent === label, label);
      await page.locator('[data-mode="review"]').click();
      await page.waitForFunction(() => document.querySelector('[data-mode="review"]').classList.contains('is-active'));
      const text = page.locator('#paper [data-editable="text"]').first();
      await text.click();
      await text.evaluate(node => {
        const range = document.createRange(); range.selectNodeContents(node.firstChild);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        node.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, composed: true}));
      });
      await page.locator('[data-action="comment"]').click();
      await page.locator('#message').fill(status);
      await page.locator('#save-entry').click();
      await page.locator('#entry-dialog').waitFor({state: 'hidden'});
      const entries = readdirSync(join(project, '.pairtex/feedback')).map(name => JSON.parse(readFileSync(join(project, '.pairtex/feedback', name))));
      const entry = entries.find(e => e.payload.comment === status);
      assert(entry, status);
      assert.equal(entry.git_status, status);
      assert.equal(entry.worktree_dirty, dirty);
      assert.equal(Boolean(entry.head_commit), head);
    }
    await checkState('not_repository', 'Not under Git', null, false);
    git('init', '-q');
    await checkState('unborn', 'No source commit yet', true, false);
    writeFileSync(join(project, '.gitignore'), '.pairtex/\n');
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture');
    await checkState('clean', 'Git version tracked', false, true);
    writeFileSync(join(project, 'main.tex'), 'Changed source');
    await checkState('dirty', 'Local changes', true, true);
    // Backend command failures are covered in Python; inject that API state here
    // to exercise its browser label and all persisted provenance fields.
    await page.route('**/api/state?*', async route => {
      const response = await route.fetch(); const data = await response.json();
      await route.fulfill({json: {...data, git_status: 'unavailable', worktree_dirty: null}});
    });
    await checkState('unavailable', 'Git status unavailable', null, true);
    console.log('PASS: offline/delayed/success math, native fractions, custom macro fallback, read-only mapping, five Git labels and saved provenance');
  } finally {
    await browser?.close();
    server.kill();
    await new Promise(res => server.exitCode !== null ? res() : server.once('exit', res));
    rmSync(project, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
