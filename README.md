<div align="center">

<img src="public/favicon.svg" width="84" alt="Bench logo" />

# Bench

### The ECE 3143 MES lab manual, running in your browser

An LPC1768 trainer board, an embedded-C compiler and an ARM7 assembler, all running client-side.
Every program from the manual, a worked solution to every exercise, and a board you wire by hand.

<br />

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![CodeMirror](https://img.shields.io/badge/CodeMirror-6-D30707?style=for-the-badge)
![Offline](https://img.shields.io/badge/Works-offline-F0A544?style=for-the-badge)

![Programs](https://img.shields.io/badge/programs-38-B4531F?style=flat-square)
![Exercises](https://img.shields.io/badge/exercises%20solved-46-E8963A?style=flat-square)
![Unit tests](https://img.shields.io/badge/unit%20tests-28%2F28-3F7D3A?style=flat-square)
![E2E](https://img.shields.io/badge/browser%20checks-84%20programs%20%2B%20143%20controls-7FC66B?style=flat-square)
![Backend](https://img.shields.io/badge/backend-none-8C2F6B?style=flat-square)

<br />

<img src="docs/screenshots/home.png" width="92%" alt="Bench landing page with a live LCD, 7-segment display and LEDs" />

</div>

---

## Contents

- [What it is](#-what-it-is)
- [Screenshots](#-screenshots)
- [Features](#-features)
- [Experiments covered](#-experiments-covered)
- [How it works](#-how-it-works)
- [The board and its wiring](#-the-board-and-its-wiring)
- [Run it locally](#-run-it-locally)
- [Deploy](#-deploy)
- [Testing](#-testing)
- [Project layout](#-project-layout)
- [Fidelity and limitations](#-fidelity-and-limitations)

---

## 🧭 What it is

Bench is a study companion for the **Microcontrollers & Embedded Systems lab (ECE 3143)**. It covers all ten
experiments, ARM7 assembly in Part A and LPC1768 embedded C in Part B, with the manual's programs, a solution
to every exercise question, and a simulated **ALS-SDA-ARMCTXM3-01** trainer board beside the code.

> [!TIP]
> Everything (compiling, assembling and simulating) runs in the visitor's browser. There is no server, no
> account and nothing to install, and after the first visit it works offline.

---

## 📸 Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/lcd.png" alt="Experiment 6: LCD message on the board" /><br /><sub><b>Exp 6 · LCD</b> - the manual's 4-bit LCD driver writing <code>ECE,MIT,MANIPAL</code></sub></td>
    <td width="50%"><img src="docs/screenshots/motors.png" alt="Experiment 9: stepper motor turning" /><br /><sub><b>Exp 9 · Stepper</b> - 200 steps = 360°, motors wired to CNA5 below the board</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/scope.png" alt="Experiment 7: DAC sine wave on the oscilloscope" /><br /><sub><b>Exp 7 · DAC sine</b> - 1.00 kHz, 0.15-3.15 V on the on-board oscilloscope</sub></td>
    <td width="50%"><img src="docs/screenshots/assembly.png" alt="Experiment 4: stepping through ARM7 assembly" /><br /><sub><b>Exp 4 · ARM7</b> - stepping a subroutine with registers, flags and the stack</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/wiring.png" alt="Plugging FRC ribbon cables by hand" /><br /><sub><b>Manual wiring</b> - click a header, then a socket, to plug a ribbon cable</sub></td>
    <td width="50%" align="center"><img src="docs/screenshots/phone.png" width="46%" alt="Bench on a phone" /><br /><sub><b>Phones</b> - Manual · Code · Board tabs</sub></td>
  </tr>
</table>

---

## ✨ Features

| | Feature | Details |
|:-:|---|---|
| 🧩 | **Embedded-C compiler** | Preprocessor, parser and bytecode VM for the lab subset: structs, unions, pointers, arrays, `switch`, interrupts, `sprintf`, multi-file projects with headers. Uses the CMSIS `LPC17xx.h` register layout. |
| 🦾 | **ARM7 assembler + CPU** | Keil syntax (`AREA`, `ENTRY`, `EQU`, `DCD/DCW/DCB`, `SPACE`, literal pools, `LDR Rx,=value`), conditional execution, barrel shifter, `LDM/STM`, `UMULL/SMLAL`. Shows a listing with machine code. |
| 🟩 | **The real board** | Built on the ALS board artwork, with live LEDs, 16×2 LCD, 4-digit 7-segment display, 4×4 key matrix, SW2/EINT2, RST, buzzer, relay and pots at their real positions. |
| 🔌 | **Manual wiring** | Plug FRC cables from any header (CNA-CND) into any socket by clicking; click a cable to unplug it. Jumpers JP5, JP7, JP8, JP16 and JP18 toggle by click. A live checklist shows what the manual's *Connections* still need. |
| ⚙️ | **3D motors** | The stepper (1.8°/step) and DC motor sit below the board, wired to CNA5, and turn exactly as the code drives them. |
| 📈 | **Oscilloscope** | Two channels with trigger, frequency, duty-cycle and voltage readings. Opens under the board for the waveform questions (PWM, DAC). |
| 🐞 | **Debugger** | Breakpoints, step over/into/out, live variables, plain-language errors pointing at the line, and runtime faults such as bad pointers or divide by zero. |
| 🔊 | **Sound** | Buzzer tones, relay clicks, a faint motor hum, and a "listen to channel A" probe speaker. |
| 📴 | **Offline + installable** | A service worker caches the whole app on the first visit; it can be installed like an app. |
| 🌗 | **Dark by default** | Copper and amber light/dark themes, a responsive layout from phone to desktop, and keyboard shortcuts (<kbd>?</kbd>). |

---

## 📚 Experiments covered

```mermaid
mindmap
  root((ECE 3143<br/>MES Lab))
    Part A · ARM7 assembly
      01 Data processing
      02 Conditions and branching
      03 Memory and arrays
      04 Subroutines and stack
    Part B · LPC1768 embedded C
      05 GPIO LEDs buzzer relay
      06 LCD and 7-segment
      07 ADC and DAC
      08 Keypad and UART
      09 Stepper and DC motor
      10 External interrupts
```

```mermaid
pie showData
    title 84 runnable programs
    "Manual programs · assembly" : 25
    "Exercise solutions · assembly" : 24
    "Manual programs · C" : 13
    "Exercise solutions · C" : 22
```

<details>
<summary><b>Full list of programs and exercises</b></summary>

| Exp | Topic | Programs | Exercises |
|:-:|---|:-:|:-:|
| 1 | Data processing: ADD, SUB, MUL, MLA, logic, shifts, rotates | 10 | 7 |
| 2 | Conditional execution and branching: sign, parity, GCD, sum of N | 5 | 6 |
| 3 | Memory and arrays: tables, search, string length, character count | 5 | 6 |
| 4 | Subroutines and stack: 64-bit add, stack parameters, multi-word transfer | 5 | 5 |
| 5 | GPIO: LEDs, buzzer, relay, square wave | 4 | 6 |
| 6 | LCD (4-bit HD44780) and multiplexed 7-segment | 2 | 2 |
| 7 | ADC to LCD, DAC ramp, square and sine waves | 2 | 3 |
| 8 | 1×4 key matrix, UART3 echo, LCD/7-seg/serial combinations | 2 | 5 |
| 9 | Stepper direction, DC motor direction and speed | 2 | 2 |
| 10 | EINT2: LED toggle, motor sequencing and speed | 1 | 4 |

</details>

---

## 🏗️ How it works

### Architecture

```mermaid
flowchart LR
    subgraph UI["🖥️ React UI"]
        ED["CodeMirror editor<br/>breakpoints · diagnostics"]
        BD["Trainer board<br/>LEDs · LCD · 7-seg · keys"]
        MT["3D motors"]
        SC["Oscilloscope"]
        CON["Console<br/>problems · serial · variables"]
    end

    subgraph CTL["🎛️ Bench controller"]
        LOOP["requestAnimationFrame loop<br/>sim time = wall time"]
        AUD["Web Audio engine"]
    end

    subgraph SIM["⚙️ Simulation core"]
        CC["C compiler<br/>preprocess → parse → bytecode"]
        VM["Bytecode VM<br/>resumable · IRQs · stepping"]
        ASM["ARM7 assembler"]
        CPU["ARMv4 CPU"]
        BUS["LPC1768 bus<br/>GPIO · timers · PWM · ADC · DAC<br/>UART · SysTick · EINT · NVIC"]
        DEV["Board devices<br/>HD44780 · 7-seg mux · keypad<br/>stepper · DC motor · relay · buzzer"]
    end

    ED -- source --> CC --> VM
    ED -- source --> ASM --> CPU
    VM <-- MMIO --> BUS --> DEV
    LOOP --> VM
    DEV -- snapshot --> BD & MT & SC
    LOOP --> AUD
    BUS -- UART / printf --> CON
    CPU -- registers · memory --> CON

    classDef ui fill:#2b1f10,stroke:#f0a544,color:#ffe2b8
    classDef ctl fill:#2a1530,stroke:#c77dff,color:#f1dcff
    classDef sim fill:#10283b,stroke:#4da3ff,color:#d6ecff
    class ED,BD,MT,SC,CON ui
    class LOOP,AUD ctl
    class CC,VM,ASM,CPU,BUS,DEV sim
```

### The C toolchain

```mermaid
flowchart LR
    A["📄 main.c<br/>lcd.c · AN_LCD.h"] --> B["Preprocessor<br/>#include · #define · #if"]
    B --> C["Lexer<br/>tokens with file:line"]
    C --> D["Parser<br/>AST · types · structs"]
    D --> E["Compiler<br/>type checks · conversions"]
    E --> F["Bytecode<br/>+ ROM strings + RAM image"]
    F --> G["VM<br/>runs in slices · STMT marks"]
    E -. "error at line N" .-> H["💬 Plain-language diagnostics"]

    style A fill:#3b2a15,stroke:#f0a544,color:#ffe2b8
    style B fill:#1d2f45,stroke:#4da3ff,color:#d6ecff
    style C fill:#1d2f45,stroke:#4da3ff,color:#d6ecff
    style D fill:#1d2f45,stroke:#4da3ff,color:#d6ecff
    style E fill:#1d2f45,stroke:#4da3ff,color:#d6ecff
    style F fill:#24331f,stroke:#7fc66b,color:#e1f5d8
    style G fill:#24331f,stroke:#7fc66b,color:#e1f5d8
    style H fill:#3a1418,stroke:#ff6b5e,color:#ffd9d6
```

### One animation frame

```mermaid
sequenceDiagram
    autonumber
    participant R as rAF loop
    participant V as Bytecode VM
    participant B as LPC1768 bus
    participant D as Board devices
    participant U as UI + audio

    R->>V: run until sim time catches up with wall time
    loop every statement
        V->>B: FIOSET / ADCR / THR … (MMIO)
        B->>D: pin changes → LCD strobe, 7-seg mux, stepper phase
        B-->>V: timer / UART / EINT interrupt pending?
        V->>V: enter IRQ handler, return
    end
    R->>D: snapshot (LED duty, segments, angles, buzzer pitch)
    D-->>U: render board, motors, scope, play sound
```

### Run states

```mermaid
stateDiagram-v2
    direction LR
    [*] --> Ready
    Ready --> Running: Build & run (F5)
    Running --> Paused: Pause / breakpoint / step
    Paused --> Running: Continue (F5)
    Paused --> Paused: Step over · into · out
    Running --> Error: runtime fault
    Ready --> Error: compile error
    Running --> Stopped: Stop / main returns
    Paused --> Ready: Reset / RST
    Error --> Running: fix & rebuild
    Stopped --> Running: Build & run
```

---

## 🔌 The board and its wiring

Ribbon cables join an **MCU header** to a **peripheral socket**. Any header can feed any socket, and the
simulator follows the actual pins. CNC → CNA1, for example, drives the LEDs from P0.15-P0.22.

```mermaid
flowchart LR
    subgraph H["LPC1768 headers"]
        CNA["CNA<br/>P0.4-P0.11"]
        CNB["CNB<br/>P1.23-26 · P2.10-13"]
        CNC["CNC<br/>P0.15-P0.22"]
        CND["CND<br/>P0.23-28 · P2.0-1"]
    end
    subgraph S["Peripheral sockets"]
        CNA1["CNA1<br/>LEDs LD2-LD9"]
        CNA2["CNA2<br/>7-seg segments"]
        CNB2["CNB2<br/>7-seg digit select"]
        CNA5["CNA5<br/>stepper · DC · relay · buzzer"]
        CNB1["CNB1<br/>LD10 · SW2/EINT2"]
        CNB3["CNB3<br/>4×4 key matrix"]
        CNAD["CNAD<br/>16×2 LCD"]
    end
    CNA ==> CNA1
    CNA ==> CNA2
    CNA ==> CNA5
    CNB ==> CNB2
    CNB ==> CNB1
    CNB ==> CNB3
    CND ==> CNAD
    CNC -. "any header to any socket" .-> CNA1

    CNA5 --> M1["⚙️ Stepper<br/>coils A-D = P0.4-P0.7"]
    CNA5 --> M2["⚙️ DC motor<br/>on = P0.9 · dir = P0.10"]
    CNA5 --> M3["🔔 Relay P0.8 · Buzzer P0.11"]

    classDef hdr fill:#3b2a15,stroke:#f0a544,color:#ffe2b8
    classDef sock fill:#10283b,stroke:#4da3ff,color:#d6ecff
    classDef dev fill:#24331f,stroke:#7fc66b,color:#e1f5d8
    class CNA,CNB,CNC,CND hdr
    class CNA1,CNA2,CNB2,CNA5,CNB1,CNB3,CNAD sock
    class M1,M2,M3 dev
```

| Jumper | Shorted means | Needed for |
|:-:|---|---|
| **JP5** | P0.26 drives LCD D7 | LCD programs (open it for the DAC) |
| **JP16** | LCD powered | every LCD program |
| **JP18 (2-3)** | POT4 → AD0.4 / P1.30 | ADC programs |
| **JP7 / JP8** | UART3 TX / RX → RS-232 port | serial programs |

---

## 🚀 Run it locally

> [!NOTE]
> Requires **Node.js 18+**.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests: every manual program and exercise on the simulator
npm run build      # production build into dist/
```

---

## ☁️ Deploy

The site is **frontend only**: a static bundle of HTML, CSS and JavaScript. All asset paths are
relative and routing uses URL hashes, so any static host works with no rewrite rules.

```mermaid
flowchart LR
    G["🐙 GitHub<br/>push to main"] --> V["▲ Vercel<br/>build: npm run build<br/>output: dist"]
    G --> N["🌐 Netlify / Cloudflare Pages"]
    G --> P["📄 GitHub Pages<br/>.github/workflows/deploy.yml"]
    V --> U["👩‍🎓 Students' browsers<br/>cached offline after first visit"]
    N --> U
    P --> U

    style G fill:#2a1530,stroke:#c77dff,color:#f1dcff
    style V fill:#3b2a15,stroke:#f0a544,color:#ffe2b8
    style N fill:#10283b,stroke:#4da3ff,color:#d6ecff
    style P fill:#10283b,stroke:#4da3ff,color:#d6ecff
    style U fill:#24331f,stroke:#7fc66b,color:#e1f5d8
```

| Host | Steps |
|---|---|
| **Vercel** *(recommended)* | Import the repo → framework **Vite** → build `npm run build` → output `dist` → Deploy |
| **Netlify** | New site from Git → build `npm run build` → publish `dist` |
| **Cloudflare Pages** | Connect to Git → preset **Vite** → output `dist` |
| **GitHub Pages** | Settings → Pages → Source: **GitHub Actions**, then push to `main` |

> [!IMPORTANT]
> Students' code edits and their cable wiring are saved in their own browser (`localStorage`). Nothing is
> sent anywhere.

---

## 🧪 Testing

```mermaid
flowchart TB
    U["🧱 Unit tests · Vitest · 28<br/>compiler semantics · every manual program · exercise results"] --> P["🧭 Browser run of all 84 programs<br/>wired by hand through the UI · results checked on the board"]
    P --> C["🖱️ 143 control checks<br/>every button · connector · jumper · key · knob · layout · offline"]

    style U fill:#24331f,stroke:#7fc66b,color:#e1f5d8
    style P fill:#10283b,stroke:#4da3ff,color:#d6ecff
    style C fill:#3b2a15,stroke:#f0a544,color:#ffe2b8
```

```bash
npm test                                  # unit tests
npm run build && npx vite preview --port 4173
node tests/e2e/e2e_programs.cjs           # run all 84 programs in the browser
node tests/e2e/e2e_ui.cjs                 # click every control
```

---

## 🗂️ Project layout

```text
src/
├── content/
│   ├── experiments.ts      aims, algorithms, connections, notes for all 10 experiments
│   └── code/               every manual program (.c / .s); ex/ holds the exercise solutions
├── sim/
│   ├── c/                  preprocessor · lexer · parser · compiler · bytecode VM · builtins
│   ├── arm/                ARM7 assembler and CPU
│   └── board/              LPC1768 peripherals · wiring model · HD44780 LCD · 5×7 font
├── bench/                  run loop controller · audio · router · storage
├── ui/                     board · motors · scope · editor · console · pages
└── assets/board.svg        ALS-SDA-ARMCTXM3-01 artwork
tests/
├── sim.test.ts             unit tests
└── e2e/                    browser end-to-end checks
```

---

## ⚖️ Fidelity and limitations

<details>
<summary><b>What is modelled, and what is simplified</b></summary>

- **Timing** is modelled, not cycle-exact. At 1× the virtual CPU runs about 2 million statements per second,
  so the manual's delay loops look the way they do on the bench. Timers, PWM, ADC, DAC and UART run on
  accurate (simulated) time.
- **Not simulated:** Ethernet, USB, CAN, I2C, SPI, RS485, the graphic LCD, RTC, watchdog and DMA.
- **Idealised:** no switch bounce, a forgiving LCD controller, ideal motors (no stall), and the UART baud
  rate is not checked against the PC.
- **C subset:** no function pointers, designated initialisers or struct-by-value arguments.
- **Assembly:** ARM state only, with no Thumb, interrupts or processor modes.
- **Manual fixes:** the printed listings' mistakes (an undeclared `delay_cnt`, an LCD buffer with no room
  for `'\0'`, LCD pins never set as outputs, an uninitialised DAC counter) are corrected, and each fix is
  noted beside its program.

</details>

> [!CAUTION]
> This is an unofficial study resource and is not affiliated with the institute.

---

<div align="center">

<sub>Made with ☕ and a lot of FRC cables by <b>Siddhant Singh</b></sub>

</div>
