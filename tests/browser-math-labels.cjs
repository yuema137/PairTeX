// Requires Playwright via NODE_PATH and a browser; exercises the real MathJax CDN.
const { chromium } = require('playwright');
const { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

(async () => {
  const project = mkdtempSync(join(tmpdir(), 'pairtex-labels-'));
  const html = join(project, 'main.html');
  const sources = ['a+b=c', String.raw`a+b=c\label{eq:demo}`, String.raw`x+y=z\label{eq:second}`, String.raw`d=e\tag{17}\label{eq:ref}`];
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  writeFileSync(join(project, 'main.tex'), sources.join('\n'));
  writeFileSync(html, sources.map((source, i) => `<p><span id="formula-${i}" data-editable="math" data-source-file="main.tex" data-source-line="${i + 1}" data-math-source="${escape(source)}"><span class="math-render"><math display="block"><mi>a</mi><mo>+</mo><mi>b</mi><mo>=</mo><mi>c</mi></math></span></span></p>`).join(''));
  const server = spawn(process.env.PYTHON || 'python3', [resolve('pairtex.py'), '--project', project, '--html', html, '--port', '0']);
  let browser;
  try {
    const url = await new Promise((res, rej) => {
      server.stdout.on('data', data => { const match = String(data).match(/http:\/\/[^\s]+/); if (match) res(match[0]); });
      server.on('error', rej); server.on('exit', code => rej(new Error(`Server exited: ${code}`)));
    });
    browser = await chromium.launch(process.env.PAIRTEX_BROWSER_CHANNEL ? {channel: process.env.PAIRTEX_BROWSER_CHANNEL} : {});
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.MathJax?.tex2mmlPromise));
    await page.evaluate(() => renderSourceMath());
    const documentState = () => page.evaluate(async () => {
      const input = MathJax.startup.document.inputJax.find(jax => jax.name === 'TeX');
      const reference = await MathJax.tex2mmlPromise(String.raw`\eqref{eq:ref}`);
      return {labels: input.parseOptions.tags.allLabels, ids: input.parseOptions.tags.allIds, reference};
    });
    const before = await documentState();
    assert(before.reference.includes('17'));
    assert(!before.reference.includes('merror'));
    async function previewContains(expected) {
      await page.waitForFunction(expected => {
        const preview = document.querySelector('#math-preview');
        return preview.dataset.renderState === 'ready' && preview.textContent.replace(/\s/g, '').includes(expected);
      }, expected);
      const failures = await page.locator('#math-preview merror, #math-preview [data-mjx-error]').allTextContents();
      assert.deepEqual(failures, []);
      const box = await page.locator('#math-preview math').boundingBox();
      assert(box.width > 0 && box.height > 0);
    }
    for (const index of [0, 1, 1, 2, 3]) {
      await page.locator(`#paper #formula-${index}`).click();
      await previewContains(index === 2 ? 'x+y=z' : index === 3 ? 'd=e' : 'a+b=c');
      assert.equal(await page.locator('#math-source').inputValue(), sources[index]);
      await page.locator('#cancel-math').click();
    }
    assert.deepEqual(await documentState(), before, 'previewing must preserve labels, ids and references');
    await page.locator('#paper #formula-1').click();
    for (const n of [2, 3, 4]) {
      await page.locator('#math-source').fill(String.raw`a+${n}=c\label{eq:demo}`);
      await previewContains(`a+${n}=c`);
    }
    // A preview may read a document reference, but must not add its own label.
    await page.locator('#math-source').fill(String.raw`\eqref{eq:ref}+q\label{eq:draft}`);
    await previewContains('(17)+q');
    assert.deepEqual(await documentState(), before);
    // Queue several real conversions in one turn: only the newest may update the UI.
    await page.evaluate(() => {
      for (const n of [5, 6, 7]) {
        const source = document.querySelector('#math-source');
        source.value = `a+${n}=c\\label{eq:demo}`;
        source.dispatchEvent(new Event('input', {bubbles: true}));
      }
    });
    await previewContains('a+7=c');
    await page.locator('#math-form button[value="save"]').click();
    await page.locator('#math-dialog').waitFor({state: 'hidden'});
    assert.equal(await page.locator('#paper #formula-1').getAttribute('data-math-source'), String.raw`a+7=c\label{eq:demo}`);
    assert.equal(await page.locator('#paper #formula-1 merror, #paper #formula-1 [data-mjx-error]').count(), 0);
    // Edit a second formula before persisting: each anchor needs its own original source.
    await page.locator('#paper #formula-2').click();
    await page.locator('#math-source').fill(String.raw`x+2=z\label{eq:second}`);
    await previewContains('x+2=z');
    await page.locator('#math-form button[value="save"]').click();
    await page.locator('#math-dialog').waitFor({state: 'hidden'});
    await page.locator('#save-edits').click();
    await page.waitForFunction(() => document.querySelector('#entry-count').textContent === '2');
    const entries = readdirSync(join(project, '.pairtex/feedback')).map(name => JSON.parse(readFileSync(join(project, '.pairtex/feedback', name))));
    for (const [index, proposed] of [[1, String.raw`a+7=c\label{eq:demo}`], [2, String.raw`x+2=z\label{eq:second}`]]) {
      const entry = entries.find(e => e.anchor.line_start_hint === index + 1);
      assert.equal(entry.anchor.selected_source_text, sources[index]);
      assert.equal(entry.payload.proposed_content, proposed);
    }
    assert.deepEqual(await documentState(), before);
    assert.equal(readFileSync(join(project, 'main.tex'), 'utf8'), sources.join('\n'));
    // Draft-only macro definitions must not have disabled real label handling.
    assert(await page.evaluate(async () => {
      await MathJax.tex2mmlPromise(String.raw`r=s\label{eq:after-preview}`);
      return Boolean(MathJax.startup.document.inputJax.find(jax => jax.name === 'TeX').parseOptions.tags.allLabels['eq:after-preview']);
    }));
    assert.deepEqual(errors, []);
    console.log('PASS: labelled previews, repeated/rapid edits, isolated references, saved labels and per-formula anchors');
  } finally {
    await browser?.close(); server.kill();
    await new Promise(res => server.exitCode !== null ? res() : server.once('exit', res));
    rmSync(project, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
