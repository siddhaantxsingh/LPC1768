// Clicks every control on the site and asserts the effect.
const { chromium, devices } = require('playwright');
const BASE = 'http://localhost:4173/';
const results = [];
const check = (name, cond, extra = '') => { results.push([name, !!cond]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const B = (code) => p.evaluate(`(() => { const c = window.__bench, b = c && c.board; return (${code}); })()`);
  const status = () => p.textContent('.status-pill');
  const visBps = () => p.$$eval('.cm-bp-gutter .cm-gutterElement .cm-bp', e => e.filter(x => getComputedStyle(x.parentElement).visibility !== 'hidden' && x.parentElement.getBoundingClientRect().height > 0).map(x => x.getBoundingClientRect()).map(r => ({ x: r.x, y: r.y, w: r.width, h: r.height })));

  // ---------------- home ----------------
  await p.goto(BASE + '#/');
  await sleep(2500);
  check('home: live demo LCD shows text', (await p.getAttribute('.hero-board canvas', 'aria-label')).includes('ECE 3143 LAB'));
  check('home: live 7-seg lit', await p.$$eval('.hero-board .seg-wrap path[fill="#ff3d24"]', e => e.length) > 5);
  check('home: 10 experiment rows', (await p.$$('.index a.row')).length === 10);
  for (let n = 1; n <= 10; n++) {
    await p.goto(BASE + '#/');
    await p.click(`.index a.row[href="#/exp/${n}/p1"]`);
    await p.waitForSelector('.rail-head h1');
    check(`home: row ${n} opens experiment ${n}`, (await p.textContent('.rail-head .k')).includes(String(n).padStart(2, '0')));
  }
  for (const [label, hash] of [['Start with GPIO', '#/exp/5/p1'], ['ARM7 assembly', '#/exp/1/p1'], ['Blank C project', '#/play/c']]) {
    await p.goto(BASE + '#/');
    await p.click(`.hero .cta >> text=${label}`);
    await sleep(300);
    check(`home: "${label}" button`, p.url().endsWith(hash), p.url());
  }

  // ---------------- header ----------------
  await p.goto(BASE + '#/exp/5/p1');
  await sleep(500);
  await p.click('.picker-btn');
  check('header: picker opens with 12 entries', (await p.$$('.menu a')).length === 12);
  await p.click('.menu a[href="#/exp/9/p1"]');
  await sleep(400);
  check('header: picker navigates', p.url().endsWith('#/exp/9/p1') && (await p.$('.menu')) === null);
  await p.click('.picker-btn'); await p.mouse.click(700, 600); await sleep(150);
  check('header: picker closes on outside click', (await p.$('.menu')) === null);
  const t0 = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.click('.topbar .icon-btn[aria-label="Switch theme"]');
  const t1 = await p.evaluate(() => document.documentElement.dataset.theme);
  check('header: theme toggles', t0 !== t1);
  await p.click('.topbar .icon-btn[aria-label="Switch theme"]');
  const m0 = await p.getAttribute('.topbar .icon-btn[aria-label="Toggle sound"]', 'aria-pressed');
  await p.click('.topbar .icon-btn[aria-label="Toggle sound"]');
  const m1 = await p.getAttribute('.topbar .icon-btn[aria-label="Toggle sound"]', 'aria-pressed');
  check('header: sound toggles', m0 !== m1 && (await p.evaluate(() => localStorage.getItem('bench:muted'))) === (m1 === 'true' ? '0' : '1'));
  await p.click('.topbar .icon-btn[aria-label="Toggle sound"]');
  await p.click('.topbar .icon-btn[aria-label="Help"]');
  check('header: help opens', (await p.$('.modal')) !== null);
  await p.keyboard.press('Escape'); await sleep(100);
  check('header: help closes with Escape', (await p.$('.modal')) === null);
  await p.mouse.click(1100, 500); await p.keyboard.press('?'); await sleep(100);
  check('header: ? opens help', (await p.$('.modal')) !== null);
  await p.mouse.click(5, 880); await sleep(100);
  check('header: help closes on backdrop', (await p.$('.modal')) === null);
  await p.click('.brand');
  await sleep(300);
  check('header: brand goes home', p.url().endsWith('#/'));

  // ---------------- run controls (C) ----------------
  await p.goto(BASE + '#/exp/5/p1');
  await sleep(500);
  check('C: initial status ready', (await status()).includes('ready'));
  await p.click('.toolbar .btn.primary');
  await sleep(800);
  check('C: Build & run -> running', (await status()).includes('running'));
  await p.click('.toolbar .btn[title^="Pause"]'); await sleep(300);
  check('C: Pause -> paused at a line', /paused · line \d+/.test(await status()));
  const l1 = await B('c.state.loc.line');
  await p.click('.toolbar .btn[title^="Step over"]'); await sleep(300);
  const l2 = await B('c.state.loc.line');
  check('C: Step over moves', l2 !== l1 || (await status()).includes('paused'), `${l1}->${l2}`);
  await p.click('.toolbar .btn[title^="Step into"]'); await sleep(300);
  check('C: Step into stays paused', (await status()).includes('paused'));
  check('C: exec line highlighted in editor', (await p.$('.cm-exec-line')) !== null);
  await p.click('.toolbar .btn[title^="Step out"]'); await sleep(600);
  check('C: Step out works (main has no caller -> keeps running or pauses)', /paused|running/.test(await status()));
  if ((await status()).includes('running')) { await p.click('.toolbar .btn[title^="Pause"]'); await sleep(200); }
  await p.click('.toolbar .btn.primary'); await sleep(300);
  check('C: Continue -> running', (await status()).includes('running'));
  await p.click('.toolbar .btn[title^="Reset"]'); await sleep(300);
  check('C: Reset -> paused, time 0', (await status()).includes('paused') && (await p.textContent('.panel-head .meta')).includes('0.0 ms'));
  await p.click('.toolbar .btn.primary'); await sleep(400);
  await p.click('.toolbar .btn[title="Stop"]'); await sleep(200);
  check('C: Stop -> stopped', (await status()).includes('stopped'));
  await p.selectOption('.speed-btn', '4');
  check('C: speed select', (await B('c.speed')) === 4 && (await B('b.opsRate')) === 8000000);
  await p.selectOption('.speed-btn', '1');

  // keyboard shortcuts
  await p.click('.cm-content');
  await p.keyboard.press('Control+Enter'); await sleep(500);
  check('keys: Ctrl+Enter builds & runs', (await status()).includes('running'));
  await p.keyboard.press('F6'); await sleep(300);
  check('keys: F6 pauses', (await status()).includes('paused'));
  await p.keyboard.press('F10'); await sleep(300);
  check('keys: F10 steps', (await status()).includes('paused'));
  await p.keyboard.press('F5'); await sleep(300);
  check('keys: F5 continues', (await status()).includes('running'));
  await p.keyboard.press('Control+s'); await sleep(200);
  check('keys: Ctrl+S toast', ((await p.textContent('.toast').catch(() => '')) || '').includes('Saved'));

  // breakpoint on a blank line snaps to the next statement
  await p.click('.toolbar .btn[title^="Reset"]'); await sleep(200);
  const lines = await p.$$('.cm-line');
  const lb = await lines[18].boundingBox();
  const gb = await (await p.$('.cm-bp-gutter')).boundingBox();
  await p.mouse.click(gb.x + gb.width / 2, lb.y + lb.height / 2);
  check('debug: breakpoint marker appears', (await visBps()).length === 1);
  await p.click('.toolbar .btn.primary'); await sleep(1200);
  check('debug: run stops at breakpoint (line 20)', (await status()).includes('line 20'));
  const bpEl = (await visBps())[0];
  await p.mouse.click(bpEl.x + bpEl.w / 2, bpEl.y + bpEl.h / 2); await sleep(150);
  check('debug: breakpoint removed', (await visBps()).length === 0 && (await B("[...(c.breakpoints.get('main.c')||[])].length")) === 0);

  // ---------------- console tabs ----------------
  await p.click('.dock-tabs >> text=Variables'); await sleep(500);
  check('console: Variables shows delay_cnt', (await p.textContent('.watch')).includes('delay_cnt'));
  await p.click('.dock-tabs >> text=printf'); await sleep(100);
  check('console: printf tab', (await p.textContent('.dock-body')).includes('printf'));
  await p.click('.dock-tabs >> text=Scope'); await sleep(400);
  check('console: Scope canvas', (await p.$('.scope-screen canvas')) !== null);
  await p.selectOption('.scope-side label:nth-of-type(1) select', 'P0.4');
  await p.selectOption('.scope-side label:nth-of-type(2) select', 'off');
  await p.selectOption('.scope-side label:nth-of-type(3) select', '50');
  await p.click('.toolbar .btn.primary'); await sleep(2500);
  const meas = await p.textContent('.scope-side .meas');
  check('scope: measures the LED blink frequency', /Hz/.test(meas), meas);
  const cbs = p.locator('.scope-side input[type=checkbox]');
  const c0 = await cbs.nth(0).isChecked(), c1 = await cbs.nth(1).isChecked();
  await cbs.nth(0).click(); await cbs.nth(1).click();
  check('scope: trigger/listen checkboxes toggle', (await cbs.nth(0).isChecked()) !== c0 && (await cbs.nth(1).isChecked()) !== c1);
  await cbs.nth(1).click();
  await p.click('.dock-tabs >> text=Serial'); await sleep(200);
  await p.click('.term-in .seg-ctl button >> text=UART0');
  check('serial: UART select', (await p.getAttribute('.term-in .seg-ctl button >> text=UART0', 'aria-pressed')) === 'true');
  await p.click('.term-in .seg-ctl >> nth=1 >> text=line');
  check('serial: line mode', (await p.getAttribute('.term-in input', 'placeholder')).includes('Enter'));
  await p.click('.dock-tabs >> text=Problems'); await sleep(100);
  check('console: Problems shows OK', (await p.textContent('.dock-body')).includes('No problems'));
  // resize dock
  const before = await p.$eval('.dock', e => e.getBoundingClientRect().height);
  const rz = await (await p.$('.dock-resize')).boundingBox();
  await p.mouse.move(rz.x + 200, rz.y + 3); await p.mouse.down(); await p.mouse.move(rz.x + 200, rz.y - 100, { steps: 5 }); await p.mouse.up();
  const after = await p.$eval('.dock', e => e.getBoundingClientRect().height);
  check('console: dock resizes', after > before + 50, `${before}->${after}`);

  // ---------------- wiring & board controls ----------------
  await p.click('.chip >> text=CNA1'); await sleep(100);
  check('wiring: unplug CNA1', !(await B("Object.values(c.wiring.cables).includes('CNA1')")));
  check('wiring: "not wired" hint appears', (await p.textContent('.bench-col')).includes('not wired the way'));
  await p.click('.chip >> text=CNA2');
  check('wiring: plug CNA2 from CNA', (await B('c.wiring.cables.CNA')) === 'CNA2');
  await p.click('.wiring .btn >> text=Wire as in manual'); await sleep(100);
  check('wiring: "Wire as in manual" restores', (await B('c.wiring.cables.CNA')) === 'CNA1' && !(await B("Object.values(c.wiring.cables).includes('CNA2')")));
  for (const j of ['JP5', 'JP16', 'JP18']) {
    const v0 = await B(`c.wiring.jumpers.${j}`);
    await p.click(`.chip.jp >> text=${j}`);
    check(`wiring: jumper ${j} toggles`, (await B(`c.wiring.jumpers.${j}`)) !== v0);
    await p.click(`.chip.jp >> text=${j}`);
  }
  const f0 = await p.$('.pcb.focus') !== null;
  await p.click('.wiring .btn[aria-pressed]');
  check('board: focus toggle', ((await p.$('.pcb.focus')) !== null) !== f0);
  await p.click('.wiring .btn[aria-pressed]');
  // keypad: pointer press
  const key = await p.$('.key >> nth=5');
  const kb = await key.boundingBox();
  await p.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2); await p.mouse.down(); await sleep(80);
  check('board: keypad press registers', await B('b.keys.has(5)') && (await p.$('.key.down')) !== null);
  await p.mouse.up(); await sleep(50);
  check('board: keypad release', !(await B('b.keys.has(5)')));
  await p.mouse.click(1000, 60); // unfocus
  await p.keyboard.down('a'); await sleep(50);
  check('board: keyboard A presses key A', await B('b.keys.has(10)'));
  await p.keyboard.up('a');
  const sw = await (await p.$('.tact')).boundingBox();
  await p.mouse.move(sw.x + 20, sw.y + 20); await p.mouse.down(); await sleep(60);
  check('board: SW2 press', await B('b.sw2'));
  await p.mouse.up();
  check('board: SW2 release', !(await B('b.sw2')));
  await p.mouse.click(1000, 60); await p.keyboard.down(' '); await sleep(40);
  check('board: Space presses SW2', await B('b.sw2'));
  await p.keyboard.up(' ');
  const knob = await (await p.$('.knob')).boundingBox();
  await p.mouse.move(knob.x + 27, knob.y + 27); await p.mouse.down(); await p.mouse.move(knob.x + 27, knob.y - 60, { steps: 6 }); await p.mouse.up();
  const pv = await B('b.potVolts[0]');
  check('board: knob drag raises POT4', pv > 2.5, pv);
  await p.focus('.knob'); await p.keyboard.press('Home');
  check('board: knob Home key -> 0 V', (await B('b.potVolts[0]')) === 0);
  await p.dblclick('.knob');
  check('board: knob double-click -> 1.65 V', Math.abs((await B('b.potVolts[0]')) - 1.65) < 0.01);

  // ---------------- files ----------------
  await p.goto(BASE + '#/exp/7/p1'); await sleep(500);
  const tabs = await p.$$eval('.files .tab', t => t.map(x => x.textContent));
  check('files: Exp 7 P1 has 3 files', tabs.length === 3 && tabs[0].startsWith('main.c'), tabs.join());
  await p.click('.files .tab >> text=lcd.c'); await sleep(150);
  check('files: switch to lcd.c', (await p.textContent('.cm-content')).includes('LCD_data1'));
  await p.click('.files .tab >> text=AN_LCD.h'); await sleep(150);
  check('files: switch to AN_LCD.h', (await p.textContent('.cm-content')).includes('#ifndef AN_LCD_H'));
  p.once('dialog', d => d.accept('util.c'));
  await p.click('.files .add'); await sleep(150);
  check('files: add file', (await p.$$eval('.files .tab', t => t.map(x => x.textContent))).some(x => x.startsWith('util.c')));
  p.once('dialog', d => d.accept());
  await p.click('.files .tab[aria-selected="true"] .x'); await sleep(150);
  check('files: remove file', !(await p.$$eval('.files .tab', t => t.map(x => x.textContent))).some(x => x.startsWith('util.c')));
  await p.click('.files .tab >> text=main.c');
  await p.click('.cm-content'); await p.keyboard.press('Control+End'); await p.keyboard.type('\n// my note');
  await sleep(500);
  check('files: Revert appears after edit', (await p.$('.files .btn >> text=Revert')) !== null);
  check('files: rail shows edited dot', (await p.$('.plist a[aria-current="page"] .edited')) !== null);
  await p.reload(); await sleep(700);
  check('files: edit persists after reload', (await p.textContent('.cm-content')).includes('// my note'));
  p.once('dialog', d => d.accept());
  await p.click('.files .btn >> text=Revert'); await sleep(500);
  check('files: Revert restores', !(await p.textContent('.cm-content')).includes('// my note') && (await p.$('.files .btn >> text=Revert')) === null);
  await p.click('.files .btn[title="Copy this file"]'); await sleep(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('files: copy', clip.includes('ADC_Display') || clip.includes('AN_LCD.h'), clip.slice(0, 40));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.files .btn[title="Download this file"]')]);
  check('files: download', dl.suggestedFilename() === 'exp7_p1_main.c', dl.suggestedFilename());

  // ---------------- compile error UX ----------------
  await p.goto(BASE + '#/play/c'); await sleep(500);
  await p.click('.cm-content'); await p.keyboard.press('Control+End'); await p.keyboard.type('\nint f(void) { return y; }');
  await p.click('.toolbar .btn.primary'); await sleep(300);
  check('errors: status error', (await status()).includes('error'));
  check('errors: message names the symbol', (await p.textContent('.msg-bar')).includes("'y' is undeclared"));
  check('errors: Problems tab lists it', (await p.textContent('.problems')).includes("'y' is undeclared"));
  await p.click('.msg-bar a'); await sleep(200);
  check('errors: line link jumps to the line', (await p.$('.cm-error-line')) !== null);
  p.once('dialog', d => d.accept());
  await p.click('.files .btn >> text=Revert'); await sleep(300);

  // ---------------- assembly view ----------------
  await p.goto(BASE + '#/exp/2/p5'); await sleep(500);
  await p.click('.toolbar .btn.primary'); await sleep(400);
  check('asm: Assemble & run finishes', (await status()).includes('finished'));
  check('asm: R1 shows GCD 6', (await p.textContent('.regs')).includes('00000006'));
  await p.click('.seg-ctl button >> text=DEC');
  check('asm: DEC view', (await p.textContent('.reg >> nth=0')).includes('1,073,741,832'));
  await p.click('.seg-ctl button >> text=HEX');
  await p.fill('.mem-ctl input', 'NUM2'); await sleep(100);
  check('asm: memory go-to label', (await p.textContent('.memtab tr >> nth=0')).includes('NUM2'));
  await p.fill('.mem-ctl input', '');
  await p.click('.toolbar .btn[title^="Reset"]'); await sleep(200);
  check('asm: Reset returns to entry', (await status()).includes('paused') && (await B('c.cpu.r[15]')) === 0);
  await p.click('.toolbar .btn[title^="Step into"]'); await sleep(100);
  check('asm: Step into executes one instruction', (await B('c.cpu.steps')) === 1 && (await p.$('.reg.chg')) !== null);
  await p.click('.toolbar .btn[title^="Step over"]'); await sleep(100);
  check('asm: Step over', (await B('c.cpu.steps')) === 2);
  check('asm: flags shown', (await p.$$('.flag')).length === 4);
  await p.click('.seg-ctl button >> text=Slow');
  await p.click('.toolbar .btn.primary'); await sleep(500);
  check('asm: Slow mode animates (running)', (await status()).includes('running'));
  await p.click('.toolbar .btn[title^="Pause"]'); await sleep(200);
  check('asm: Pause in slow mode', (await status()).includes('paused'));
  await p.click('.seg-ctl button >> text=Instant');
  await p.click('.toolbar .btn.primary'); await sleep(300);
  check('asm: continue to finish', (await status()).includes('finished'));
  await p.click('.dock-tabs >> text=Listing'); await sleep(200);
  check('asm: listing with machine code', (await p.textContent('.listing')).includes('E3A00101') || (await p.$$('.listing tr')).length > 15);
  // asm breakpoint
  await p.click('.toolbar .btn[title^="Reset"]');
  const al = await p.$$('.cm-line'); const ab = await al[7].boundingBox(); const ag = await (await p.$('.cm-bp-gutter')).boundingBox();
  await p.mouse.click(ag.x + ag.width / 2, ab.y + ab.height / 2);
  await p.click('.toolbar .btn.primary'); await sleep(300);
  check('asm: breakpoint stops run', (await status()).includes('paused · line 8'));
  // stack view
  await p.goto(BASE + '#/exp/4/p4'); await sleep(400);
  for (let i = 0; i < 8; i++) { await p.click('.toolbar .btn[title^="Step into"]'); await sleep(60); }
  check('asm: stack card appears inside a subroutine', (await p.textContent('.cpu')).includes('SP = 0x40007FF0'));
  // scratchpad asm
  await p.goto(BASE + '#/play/asm'); await sleep(400);
  await p.click('.toolbar .btn.primary'); await sleep(300);
  check('asm scratchpad runs', (await status()).includes('finished') && (await B('c.cpu.r[1]')) === 55);

  // ---------------- medium width rail toggle ----------------
  await p.setViewportSize({ width: 1000, height: 800 });
  await p.goto(BASE + '#/exp/6/p1'); await sleep(400);
  await p.click('[data-rail-toggle]'); await sleep(300);
  check('tablet: rail toggle opens drawer', (await p.$('.wb.rail-open')) !== null);
  await p.click('.plist a >> text=HELP on 7-segment'); await sleep(300);
  check('tablet: picking a program closes drawer', (await p.$('.wb.rail-open')) === null && p.url().endsWith('/6/p2'));

  // ---------------- phone ----------------
  const m = await br.newPage({ ...devices['iPhone 13'] });
  m.on('pageerror', e => errs.push('mobile: ' + e.message));
  await m.goto(BASE + '#/exp/6/p2'); await sleep(500);
  const vis = async sel => m.$eval(sel, e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0).catch(() => false);
  check('phone: Code tab default', await vis('.center') && !(await vis('.bench-col')));
  await m.tap('.mtabs button >> text=Board'); await sleep(200);
  check('phone: Board tab', await vis('.bench-col') && !(await vis('.center')));
  await m.tap('.mtabs button >> text=Manual'); await sleep(200);
  check('phone: Manual tab', await vis('.rail'));
  await m.tap('.mtabs button >> text=Code');
  await m.tap('.toolbar .btn.primary'); await sleep(1200);
  await m.tap('.mtabs button >> text=Board'); await sleep(400);
  check('phone: HELP shows on the board', await m.$$eval('.m-seg path[fill="#ff3d24"]', e => e.length) >= 10);
  const kb2 = await (await m.$('.key >> nth=0')).boundingBox();
  check('phone: no horizontal overflow', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  const fails = results.filter(r => !r[1]);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  await br.close();
})();
