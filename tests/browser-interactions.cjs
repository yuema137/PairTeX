// Run with NODE_PATH pointing to an installed Playwright package.
// PAIRTEX_TEST_HTML optionally exercises a real rendered manuscript.
const { chromium } = require('playwright');
const { mkdtempSync, writeFileSync, readdirSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

(async () => {
  const project = mkdtempSync(join(tmpdir(), 'pairtex-browser-'));
  const html = process.env.PAIRTEX_TEST_HTML || join(project, 'main.html');
  writeFileSync(join(project, 'main.tex'), 'Browser regression fixture');
  if (!process.env.PAIRTEX_TEST_HTML) writeFileSync(html, '<p>Editable prose <span data-source-file="main.tex" data-editable="math" data-math-source="x"><span class="math-render"><math>x</math></span></span> after the formula.</p>');
  const server = spawn(process.env.PYTHON || 'python3', [resolve('pairtex.py'), '--project', project, '--html', html, '--port', '0']);
  server.stderr.pipe(process.stderr);
  let browser;
  try {
    const url = await new Promise((resolveURL, reject) => {
      server.stdout.on('data', data => { const match = String(data).match(/http:\/\/[^\s]+/); if (match) resolveURL(match[0]); });
      server.on('error', reject);
      server.on('exit', code => reject(new Error(`Server exited: ${code}`)));
    });
    browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const text = page.locator('#paper [data-editable="text"]').filter({visible:true}).first();
    await text.waitFor();
    // Wait explicitly: otherwise a fast interaction test can finish before
    // the asynchronous MathJax script exposes malformed renderer MathML.
    await page.waitForFunction(() => Boolean(window.MathJax?.tex2mmlPromise));
    const math = await page.evaluate(async () => {
      await renderSourceMath();
      const root = document.querySelector('#paper').shadowRoot;
      return {
        count: root.querySelectorAll('math').length,
        errors: root.querySelectorAll('merror, mjx-merror, parsererror').length,
        bareTokens: [...root.querySelectorAll('math, mrow')].some(node =>
          [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim())),
      };
    });
    assert(math.count > 0);
    assert.equal(math.errors, 0);
    assert.equal(math.bareTokens, false);
    const original = await text.innerText();
    await text.click();
    assert.deepEqual(await text.evaluate(node => ({
      outline: getComputedStyle(node).outlineStyle,
      border: getComputedStyle(node.closest('.paper')).borderTopWidth,
      editable: node.isContentEditable,
    })), { outline: 'none', border: '0px', editable: true });
    await page.keyboard.press('Home');
    await page.keyboard.type('TEST ');
    await page.locator('#save-edits').click();
    await page.waitForFunction(() => document.querySelector('#entry-count').textContent === '1');
    await text.evaluate(node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      node.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, composed:true}));
    });
    await page.locator('[data-action="comment"]').click();
    await page.locator('#message').fill('Browser regression comment');
    await page.locator('#save-entry').click();
    await page.waitForFunction(() => document.querySelector('#entry-count').textContent === '2');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#entry-count').textContent === '2');
    await page.locator('#refresh-view').click();
    await page.waitForFunction(() => document.querySelector('#refresh-view').textContent === 'Refresh');
    assert.equal(await page.locator('#paper [data-editable="text"]').first().getAttribute('contenteditable'), 'true');
    const entries = readdirSync(join(project,'.pairtex/feedback')).map(file => JSON.parse(readFileSync(join(project,'.pairtex/feedback',file))));
    assert(entries.some(e => e.kind === 'comment' && e.payload.comment === 'Browser regression comment'));
    assert(entries.some(e => e.kind === 'change' && e.payload.proposed_content.includes('TEST')));
    assert.deepEqual(errors, []);
    if (process.env.PAIRTEX_SCREENSHOT) await page.screenshot({path:process.env.PAIRTEX_SCREENSHOT, fullPage:true});
    console.log(JSON.stringify({passed:true, project, original:original.slice(0,80), entries:entries.length}));
  } finally { await browser?.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode=1; });
