# Bench — LPC1768 & ARM7 lab, in the browser

A study companion for the **ECE 3143 Microcontrollers & Embedded Systems lab manual**.
All ten experiments, every program from the manual, and a worked solution to every
exercise — running on a simulated ALS LPC1768 trainer board, entirely in the browser.

- **Experiments 1–4 (ARM7 assembly)** — a Keil-style assembler (AREA, ENTRY, EQU, DCD/DCW/DCB,
  SPACE, literal pools, `LDR Rx,=value`) and an ARM7TDMI core. Step through programs and watch
  registers, N/Z/C/V flags, data memory and the stack. Includes a listing with machine code.
- **Experiments 5–10 (LPC1768 embedded C)** — a C compiler for the lab subset (structs, pointers,
  arrays, `switch`, interrupts, `sprintf`, multi-file projects with headers) using the CMSIS
  `LPC17xx.h` register layout, running on a bytecode VM with breakpoints and stepping.
- **The trainer board** — LEDs LD2–LD10, 16×2 HD44780 LCD (4-bit mode), 4-digit multiplexed
  7-segment display, 4×4 key matrix, SW2 / EINT2, buzzer (with sound), relay (with click),
  stepper motor, DC motor, two potentiometers on the ADC, DAC, PWM, timers, SysTick, UART with a
  serial terminal, and an oscilloscope. Peripherals only respond when the right FRC cables and
  jumpers are connected, exactly as the manual's *Connections* section describes.

## Run it locally

Requires Node.js 18 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # runs every manual program and exercise on the simulator
npm run build      # production build into dist/
```

## Deploying

The site is **frontend only** — a static bundle of HTML, CSS and JavaScript. There is no server,
database or API: compiling, assembling and simulating all happen in the visitor's browser, and
students' edits are stored in their own browser (`localStorage`). Any static host works, and the
free tiers are plenty.

`npm run build` produces the `dist/` folder. All asset paths are relative, so the same build works
at a domain root or in a sub-folder.

### Vercel (recommended)
1. Push this folder to a GitHub repository.
2. On vercel.com → **Add New… → Project**, import the repository.
3. Vercel detects Vite automatically (build command `npm run build`, output directory `dist`). Click **Deploy**.

Every push to the main branch redeploys; pull requests get preview URLs.

### Netlify
1. On app.netlify.com → **Add new site → Import an existing project**, pick the repository.
2. Build command `npm run build`, publish directory `dist`. Deploy.

(Or drag the `dist/` folder onto app.netlify.com/drop for a one-off deploy.)

### Cloudflare Pages
**Workers & Pages → Create → Pages → Connect to Git**, framework preset *Vite*, build command
`npm run build`, output `dist`.

### GitHub Pages
The workflow in `.github/workflows/deploy.yml` builds and publishes the site. In the repository
go to **Settings → Pages → Build and deployment → Source: GitHub Actions**, then push to `main`.
The site appears at `https://<user>.github.io/<repo>/`.

Routing uses URL hashes (`#/exp/5/p1`), so no rewrite rules are needed on any host.

## Project layout

```
src/
  content/            experiments.ts (aims, algorithms, connections, notes) and code/ (all programs)
  sim/c/              C preprocessor, parser, compiler and bytecode VM
  sim/arm/            ARM7 assembler and CPU
  sim/board/          LPC1768 peripherals, trainer-board devices, wiring model, LCD
  bench/              run-loop controller, audio engine, storage, router
  ui/                 React components (editor, board, CPU view, scope, console)
tests/sim.test.ts     end-to-end checks of every program
```

## Notes on fidelity

Timing is modelled, not cycle-exact. The virtual CPU runs at 2 million statements per second at
1× speed, which makes the manual's delay loops look the way they do on the bench; timers, PWM,
the ADC, the DAC and the UART run on real (simulated) time. Programs that pace output with a
timer (tones, DAC waveforms) set a higher default speed so they keep up.

Where the printed listings contain mistakes (an undeclared `delay_cnt`, an LCD buffer with no room
for `'\0'`, pins never set as outputs), the code here is corrected and each fix is noted beside
the program.

This is an unofficial resource and is not affiliated with the institute.
