// Connector model of the ALS LPC1768 trainer: MCU-side 10-pin FRC headers and
// peripheral-side sockets. A ribbon cable joins one header to one socket.

export type Header = 'CNA' | 'CNB' | 'CNC' | 'CND';
export type Socket = 'CNA1' | 'CNA2' | 'CNA5' | 'CNB1' | 'CNB2' | 'CNB3' | 'CNAD';
export type Jumper = 'JP5' | 'JP16' | 'JP18';

export interface PinRef { port: number; bit: number }

export const HEADERS: Record<Header, { pins: (PinRef | 'JP5' | null)[]; desc: string }> = {
  CNA: { desc: 'P0.4 – P0.11', pins: [4, 5, 6, 7, 8, 9, 10, 11].map(b => ({ port: 0, bit: b })) },
  CNB: { desc: 'P1.23 – P1.26, P2.10 – P2.13', pins: [{ port: 1, bit: 23 }, { port: 1, bit: 24 }, { port: 1, bit: 25 }, { port: 1, bit: 26 }, { port: 2, bit: 10 }, { port: 2, bit: 11 }, { port: 2, bit: 12 }, { port: 2, bit: 13 }] },
  CNC: { desc: 'P0.15 – P0.22', pins: [15, 16, 17, 18, 19, 20, 21, 22].map(b => ({ port: 0, bit: b })) },
  CND: { desc: 'P0.23 – P0.28, P2.0 – P2.1', pins: [{ port: 0, bit: 23 }, { port: 0, bit: 24 }, { port: 0, bit: 25 }, 'JP5', { port: 0, bit: 27 }, { port: 0, bit: 28 }, { port: 2, bit: 0 }, { port: 2, bit: 1 }] },
};

export const SOCKETS: Record<Socket, { title: string; lines: string[]; home: Header }> = {
  CNA1: { title: 'LEDs LD2–LD9', home: 'CNA', lines: ['LD2', 'LD3', 'LD4', 'LD5', 'LD6', 'LD7', 'LD8', 'LD9'] },
  CNA2: { title: '7-segment data a–h', home: 'CNA', lines: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] },
  CNA5: { title: 'Stepper · relay · DC motor · buzzer', home: 'CNA', lines: ['Coil A', 'Coil B', 'Coil C', 'Coil D', 'Relay', 'DC enable', 'DC direction', 'Buzzer'] },
  CNB1: { title: 'LD10 · SW2 (EINT2)', home: 'CNB', lines: ['LD10', '–', '–', '–', '–', '–', 'SW2', '–'] },
  CNB2: { title: '7-segment digit select', home: 'CNB', lines: ['Sel A', 'Sel B', 'Sel C', 'Sel D', '–', '–', '–', '–'] },
  CNB3: { title: '4×4 key matrix', home: 'CNB', lines: ['Col 1', 'Col 2', 'Col 3', 'Col 4', 'Row 1', 'Row 2', 'Row 3', 'Row 4'] },
  CNAD: { title: 'Alphanumeric LCD', home: 'CND', lines: ['D4', 'D5', 'D6', 'D7', 'RS', 'EN', '–', '–'] },
};

export const JUMPERS: Record<Jumper, { title: string; desc: string }> = {
  JP5: { title: 'JP5', desc: 'Routes P0.26 to CND pin 4 (LCD D7). Open it to use the DAC output on P0.26.' },
  JP16: { title: 'JP16', desc: 'Powers the alphanumeric LCD.' },
  JP18: { title: 'JP18 (2-3)', desc: 'Connects POT4 to AD0.4 / P1.30.' },
};

export interface Wiring {
  cables: Partial<Record<Header, Socket>>;
  jumpers: Record<Jumper, boolean>;
}

export const emptyWiring = (): Wiring => ({ cables: {}, jumpers: { JP5: true, JP16: true, JP18: true } });

export function pinLabel(p: PinRef) { return `P${p.port}.${p.bit}`; }

/** Resolve which MCU pin feeds a given socket line, or null. */
export function socketLine(w: Wiring, s: Socket, line: number): PinRef | null {
  for (const [h, sock] of Object.entries(w.cables) as [Header, Socket][]) {
    if (sock !== s) continue;
    const p = HEADERS[h].pins[line];
    if (!p) return null;
    if (p === 'JP5') return w.jumpers.JP5 ? { port: 0, bit: 26 } : null;
    return p;
  }
  return null;
}

export function headerFor(w: Wiring, s: Socket): Header | null {
  for (const [h, sock] of Object.entries(w.cables) as [Header, Socket][]) if (sock === s) return h;
  return null;
}

export function describeWiring(w: Wiring): string {
  const parts = (Object.entries(w.cables) as [Header, Socket][]).map(([h, s]) => `${h}→${s}`);
  return parts.length ? parts.join(', ') : 'no cables';
}
