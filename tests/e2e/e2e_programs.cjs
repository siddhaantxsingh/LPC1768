// Runs every program/exercise through the real UI and checks the simulated result.
const { chromium } = require('playwright');
const BASE = 'http://localhost:4173/';

const W = (fn) => fn.toString();
// asm checks: r(i) register, m(label, i) word, s(label) string
const ASM = {
  '1/p1': 'r(2)===0x30 && r(3)===0x10', '1/p2': 'r(2)===300', '1/p3': 'r(3)===70', '1/p4': 'ERROR:cannot be encoded',
  '1/p5': 'r(1)===0xEDCBA987', '1/p6': 'r(2)===0xFFFFFF0F', '1/p7': 'r(2)===0x1234560F', '1/p8': 'r(1)===50&&r(2)===100&&r(3)===200',
  '1/p9': 'r(1)===40', '1/p10': 'r(1)===0x81234567',
  '1/x1': 'r(3)===60', '1/x2': 'r(4)===60', '1/x3': 'r(2)===0x12345687', '1/x4': 'r(3)===1', '1/x5': 'r(1)===0x56', '1/x6': 'r(1)===0xFFFFFFCE', '1/x7': 'r(3)===0x3412',
  '2/p1': 'r(1)===0xFFFFFFFF', '2/p2': "m('RESULT')===1", '2/p3': "m('RESULT')===40", '2/p4': "m('RESULT')===55", '2/p5': "m('RESULT')===6",
  '2/x1': "m('RESULT')===1", '2/x2': "m('LARGEST')===92", '2/x3': "m('RESULT')===30", '2/x4': "m('RESULT')===25", '2/x5': "m('RESULT')===720", '2/x6': "m('RESULT')===243",
  '3/p1': "[0,1,2,3,4,5,6,7,8,9].every(i=>m('RESULT',i)===5*(i+1))", '3/p2': "m('RESULT')===90", '3/p3': "m('RESULT')===2", '3/p4': "m('COUNT')===12", '3/p5': "m('COUNT')===4",
  '3/x1': "m('EVENS')===4&&m('ODDS')===4", '3/x2': "m('POS')===3&&m('NEG')===3&&m('ZERO')===2", '3/x3': "[0,1,2,3,4].every(i=>m('DST',i)===5-i)",
  '3/x4': "s('STR1')==='EMBEDDED SYSTEMS LAB 2026'", '3/x5': "m('RESULT')===1", '3/x6': "[-7,0,3,19,44,88].every((v,i)=>(m('ARRAY',i)|0)===v)",
  '4/p1': "m('RESULT')===375", '4/p2': "m('RESULT')===150", '4/p3': 'r(4)===20&&r(13)===0x40008000', '4/p4': "m('RESULT')===0&&m('RESULT',1)===4", '4/p5': "[...Array(15)].every((_,i)=>m('DEST',i)===i+1)",
  '4/x1': "m('RESULT')===0x11233", '4/x2': "(m('RESULT')&0xFFFF)===0x3DCC", '4/x3': "m('PRODUCT')===0x9ABCDEF0&&m('PRODUCT',1)===0x9BE02467&&m('PRODUCT',2)===0x01234567&&m('PRODUCT',3)===0",
  '4/x4': "m('RESULT')===5040", '4/x5': "m('RESULT')===0x8245",
};

// C checks. `wait` ms of real time after Run; `act` runs in page with b=board,c=ctl before/after
const C = {
  '5/p1': { wait: 2500, poll: 'b.ports[0].latch & 0xFF0', expect: 'vals.includes(0)&&vals.includes(0xFF0)' },
  '5/p2': { wait: 2500, poll: 'S().buzzer.mode', expect: "vals.includes('dc')&&vals.includes('off')" },
  '5/p3': { wait: 2500, poll: 'S().relay', expect: 'vals.includes(true)&&vals.includes(false)' },
  '5/p4': { wait: 2500, poll: '(b.ports[1].latch>>23)&1', expect: 'vals.includes(0)&&vals.includes(1)' },
  '5/x1': { wait: 3000, poll: 'b.ports[0].latch & 0xFF0', expect: 'new Set(vals).size>=4 && vals.every(v=>v===0||(v&(v-1))===0)' },
  '5/x2': { wait: 4000, poll: '(b.ports[0].latch>>4)&0xFF', expect: "vals.every(v=>[0,1,3,7,15,31,63,127,255,254,252,248,240,224,192,128].includes(v)) && new Set(vals).size>=4" },
  '5/x3': { wait: 4000, poll: '(b.ports[0].latch>>4)&0xFF', expect: 'vals.every(v=>v<16) && new Set(vals).size>=4' },
  '5/x4': { wait: 2500, poll: 'S().buzzer.mode==="tone"?Math.round(S().buzzer.freq):0', expect: 'vals.some(f=>f>240&&f<560)' },
  '5/x5': { wait: 2500, final: 'S().ld10', expect: 'v>0.65&&v<0.85' },
  '5/x6': { wait: 1500, final: 'b.pwmChannels().duties[3]', expect: 'Math.abs(v-0.5)<0.02' },
  '6/p1': { wait: 5000, final: 'b.lcd.text()[0]', expect: "v==='ECE,MIT,MANIPAL '" , ui: 'LCD shows: ECE,MIT,MANIPAL' },
  '6/p2': { wait: 1500, final: 'segstr()', expect: "v==='01101110|10011110|00011100|11001110'" },
  '6/x1': { wait: 1500, poll: 'segstr()', expect: "vals.includes('00000000|10011110|10011100|10011110')" },
  '6/x2': { wait: 7000, poll: 'b.lcd.shift', expect: 'new Set(vals).size>=3 && b.lcd.text().join("").includes("ECE")||new Set(vals).size>=3' },
  '7/p1': { wait: 7000, pre: 'c.setPot(0, 2.5); b.adcNoise=false', final: 'b.lcd.text().join("|")', expect: "v.includes('ANALOG IP:2.50V')&&v.includes('ADC OUTPUT:c1e')" },
  '7/p2': { wait: 2000, final: 'b.dacCount', expect: 'v>500' },
  '7/x1': { wait: 2500, pre: 'c.setPot(0, 3.3); b.adcNoise=false', final: 'segstr()', expect: "v==='00000000|10001110|10001110|10001110'" },
  '7/x2': { wait: 2000, final: 'dacStats()', expect: 'Math.abs(v.max-3.297)<0.01 && v.min===0' },
  '7/x3': { wait: 2500, final: 'dacStats()', expect: 'v.min<0.2&&v.max>3.1' },
  '8/p1': { wait: 2500, pre: "c.pressKey(3,true)", poll: '(b.ports[0].latch>>4)&0xFF', expect: 'vals.some(v=>v!==0)' },
  '8/p2': { wait: 600, after: "c.sendUart(3,'Hi MES')", afterWait: 1200, final: 'b.uarts[3].out', expect: "v==='Hi MES'" },
  '8/x1': { wait: 2500, pre: 'c.pressKey(1,true)', poll: 'S().buzzer.mode==="tone"?Math.round(S().buzzer.freq):0', expect: 'vals.some(f=>f>290&&f<345)' },
  '8/x2': { wait: 4500, pre: 'c.pressKey(6,true)', final: 'b.lcd.text()[1]', expect: "v==='KEY 6: MES LAB  '" },
  '8/x3': { wait: 1500, pre: 'c.pressKey(13,true)', final: 'segstr()', expect: "v.split('|')[3]==='01111010'" },
  '8/x4': { wait: 3000, after: "c.sendUart(3,'LPC1768')", afterWait: 2500, final: 'b.lcd.text()[0]+"#"+b.uarts[3].out', expect: "v==='LPC1768         #LPC1768'" },
  '8/x5': { wait: 2500, pre: 'c.setPot(0,1.0); b.adcNoise=false', final: 'b.uarts[3].out', expect: "v.includes('ADC = 0x4D9  (1.00 V)')" },
  '9/p1': { wait: 3500, poll: 'S().stepper.angle', expect: 'Math.max(...vals)>100 && vals.every(a=>a>=-0.1&&a<=360.1)' },
  '9/p2': { wait: 3000, poll: 'Math.sign(Math.round(S().dc.speed*10))', expect: 'vals.includes(1)&&vals.includes(-1)' },
  '9/x1': { wait: 3500, final: 'S().stepper.angle', expect: 'v===-180' },
  '9/x2': { wait: 4000, poll: 'Math.round(S().dc.duty*10)/10', expect: 'vals.includes(0.3)' },
  '10/p1': { wait: 600, after: "c.setSw2(true); setTimeout(()=>c.setSw2(false),80)", afterWait: 600, final: '(b.ports[1].latch>>23)&1', expect: 'v===0', also: 'irq' },
  '10/x1': { wait: 1200, after: "window.__a0=S().stepper.angle; c.setSw2(true); setTimeout(()=>c.setSw2(false),80)", afterWait: 1500, final: 'S().stepper.angle - window.__a0', expect: 'v<0', also: 'irq' },
  '10/x2': { wait: 800, after: "window.__d0=(b.ports[0].latch>>10)&1; c.setSw2(true); setTimeout(()=>c.setSw2(false),80)", afterWait: 800, final: '((b.ports[0].latch>>10)&1) !== window.__d0', expect: 'v===true' },
  '10/x3': { wait: 800, after: "c.setSw2(true); setTimeout(()=>c.setSw2(false),80)", afterWait: 1500, poll2: true, final: 'S().dc.duty', expect: 'v>0.2&&v<0.45' },
  '10/x4': { wait: 800, after: "window.__a0=S().stepper.angle; c.setSw2(true); setTimeout(()=>c.setSw2(false),80)", afterWait: 1500, final: 'S().stepper.angle-window.__a0', expect: 'v>0' },
};

const HELP = `
  const c = window.__bench, b = c.board;
  const S = () => c.state.snapshot;
  const segstr = () => { const s = c.state.snapshot; return s.seg.map(r=>r.map(x=>x>0.05?1:0).join('')).join('|'); };
  const dacStats = () => { const v=[]; for (let i=1;i<=200 && i<=b.dacCount;i++) v.push(b.dacV[(b.dacHead-i)&(b.dacN-1)]); return {min:Math.min(...v), max:Math.max(...v)}; };
`;

(async () => {
  const br = await chromium.launch();
  const page = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const results = [];
  const evalIn = (code) => page.evaluate(code);
  for (const exp of [1,2,3,4,5,6,7,8,9,10]) {
    await page.goto(BASE + '#/exp/' + exp + '/p1');
    await page.waitForSelector('.plist a', { state: 'attached' });
    if (!(await page.isVisible('.plist a'))) { await page.click('.rail-btn'); await page.waitForSelector('.plist a'); }
    const ids = await page.$$eval('.plist a', as => as.map(a => a.getAttribute('href').split('/').pop()));
    for (const id of ids) {
      const key = exp + '/' + id;
      await page.click(`.plist a[href$="/${exp}/${id}"]`);
      await page.waitForTimeout(250);
      // the bench keeps cables between programs: unplug everything, then wire through the UI
      let wired = true;
      if (exp >= 5) {
        if (!(await page.$('.conn-pop'))) await page.click('.conn-chip');
        await page.click('.conn-pop >> text=Unplug all');
        const cables = await evalIn('Object.keys(window.__bench.wiring.cables).length');
        if (cables !== 0) wired = false;
        if (await page.$('.conn-pop button:has-text("Connect for me"):not([disabled])')) await page.click('.conn-pop >> text=Connect for me');
        else if (await page.$('.conn-pop')) await page.click('.conn-chip');
        await page.waitForTimeout(100);
        wired = wired && (await page.$('.conn-chip.on')) !== null;
      }
      let ok = false, detail = '';
      if (exp <= 4) {
        await page.click('.toolbar .btn.primary');
        await page.waitForTimeout(250);
        const chk = ASM[key];
        if (chk.startsWith('ERROR:')) {
          const msg = await page.textContent('.msg-bar').catch(() => '');
          ok = msg.includes(chk.slice(6)); detail = msg.slice(0, 90);
        } else {
          const r = await evalIn(`(() => { const c = window.__bench, cpu = c.cpu; if (!cpu) return {err:'no cpu', msg: c.state.message};
            const r = i => cpu.r[i] >>> 0; const sym = n => cpu.prog.symbols.get(n).value;
            const m = (n, i=0) => cpu.peek32(sym(n) + i*4);
            const s = n => { let a = sym(n), o=''; for(;;){ const ch = cpu.mem.get(a++)||0; if(!ch) break; o+=String.fromCharCode(ch);} return o; };
            return { pass: !!(${chk}), halted: cpu.halted, status: c.state.status, msg: c.state.message }; })()`);
          ok = r.pass && r.status === 'halted'; detail = JSON.stringify(r).slice(0, 140);
          // UI shows finished pill
          const pill = await page.textContent('.status-pill');
          if (!pill.includes('finished')) { ok = false; detail += ' pill=' + pill; }
        }
      } else {
        const t = C[key];
        if (t.pre) { await page.click('.toolbar .btn.primary'); await page.waitForTimeout(150); await evalIn(`(() => {${HELP} ${t.pre} })()`); }
        else await page.click('.toolbar .btn.primary');
        const vals = [];
        const end = Date.now() + t.wait;
        while (Date.now() < end) {
          await page.waitForTimeout(100);
          if (t.poll) vals.push(await evalIn(`(() => {${HELP} return ${t.poll}; })()`));
        }
        if (t.after) { await evalIn(`(() => {${HELP} ${t.after} })()`); await page.waitForTimeout(t.afterWait); }
        if (t.poll2) { const xs = []; for (let i = 0; i < 12; i++) { xs.push(await evalIn(`(() => {${HELP} return ${t.final}; })()`)); await page.waitForTimeout(60); } t.final = String(xs.reduce((a, b) => a + b, 0) / xs.length); }
        const res = await evalIn(`(() => {${HELP} const vals=${JSON.stringify(vals)}; const v = ${t.final ? t.final : 'null'}; return { pass: !!(${t.expect}), v, status: c.state.status, msg: c.state.message, irq: c.state.snapshot && c.state.snapshot.irqCount }; })()`);
        ok = res.pass && res.status === 'running';
        if (t.also === 'irq' && !(res.irq > 0)) ok = false;
        if (t.ui) { const lab = await page.getAttribute('.t-lcd canvas', 'aria-label'); if (!lab.includes(t.ui)) { ok = false; res.ui = lab; } }
        detail = JSON.stringify({ v: res.v, status: res.status, msg: res.msg, ui: res.ui, sample: vals.slice(-6) }).slice(0, 220);
        await page.click('.toolbar .btn[title^="Pause"]').catch(() => {});
      }
      if (!wired) { ok = false; detail = 'NOT WIRED ' + detail; }
      results.push([key, ok, detail]);
      console.log((ok ? 'PASS ' : 'FAIL ') + key.padEnd(6) + ' ' + (ok ? '' : detail));
    }
  }
  const fails = results.filter(r => !r[1]);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  await br.close();
})();
