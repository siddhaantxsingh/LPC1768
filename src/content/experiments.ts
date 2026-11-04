import type { Wiring } from '../sim/board/wiring';

const raw = import.meta.glob('./code/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const src = (name: string): string => {
  const v = raw['./code/' + name];
  if (v === undefined) throw new Error('missing code file ' + name);
  return v;
};

export type Lang = 'asm' | 'c';
export type Device = 'leds' | 'ld10' | 'sw2' | 'buzzer' | 'relay' | 'lcd' | 'seg' | 'keypad' | 'stepper' | 'dc' | 'adc' | 'dac' | 'scope' | 'uart';

export interface Program {
  id: string;
  kind: 'program' | 'exercise';
  no: number;
  title: string;
  question: string;
  lang: Lang;
  files: Record<string, string>;
  main: string;
  algorithm?: string[];
  connections?: string[];
  wiring?: Wiring;
  output?: string;
  notes?: string[];
  tryIt?: string[];
  devices?: Device[];
  speed?: number;       // CPU speed multiplier the program is tuned for
  scope?: { a?: string; b?: string; tb?: number };
  terminal?: number;    // UART index to open the serial tab on
  watch?: string[];     // memory labels worth watching (assembly)
}

export interface Experiment {
  no: number;
  slug: string;
  title: string;
  short: string;
  lang: Lang;
  aim: string;
  programs: Program[];
  exercises: Program[];
}

const W = (cables: Wiring['cables'], jumpers: Partial<Wiring['jumpers']> = {}): Wiring => ({
  cables,
  jumpers: { JP5: true, JP16: true, JP18: true, ...jumpers },
});

const asm = (no: number, title: string, question: string, file: string, extra: Partial<Program> = {}): Program => ({
  id: 'p' + no, kind: 'program', no, title, question, lang: 'asm', files: { 'main.s': src(file) }, main: 'main.s', ...extra,
});
const asmX = (no: number, title: string, question: string, file: string, output: string, extra: Partial<Program> = {}): Program => ({
  id: 'x' + no, kind: 'exercise', no, title, question, lang: 'asm', files: { 'main.s': src('ex/' + file) }, main: 'main.s', output, ...extra,
});
const lcdFiles = () => ({ 'lcd.c': src('lcd_lib.c'), 'AN_LCD.h': src('AN_LCD.h') });
const cprog = (no: number, title: string, question: string, file: string, extra: Partial<Program> = {}): Program => ({
  id: 'p' + no, kind: 'program', no, title, question, lang: 'c', files: { 'main.c': src(file) }, main: 'main.c', ...extra,
});
const cX = (no: number, title: string, question: string, file: string, extra: Partial<Program> = {}): Program => {
  const text = src('ex/' + file);
  const files: Record<string, string> = { 'main.c': text };
  if (text.includes('AN_LCD.h')) Object.assign(files, lcdFiles());
  return { id: 'x' + no, kind: 'exercise', no, title, question, lang: 'c', files, main: 'main.c', ...extra };
};

const ALGO_GPIO = [
  'Initialise the board with SystemInit() and SystemCoreClockUpdate().',
  'Select the GPIO function for the pins with LPC_PINCON->PINSELx.',
  'Make the pins outputs with LPC_GPIOx->FIODIR.',
  'In an endless loop, set and clear the pins with FIOSET / FIOCLR, waiting in a delay loop between them.',
];

export const EXPERIMENTS: Experiment[] = [
  {
    no: 1, slug: 'data-processing', lang: 'asm',
    title: 'ARM7 assembly language programming using basic data processing instructions',
    short: 'Data processing',
    aim: 'To develop and execute ARM7 assembly language programs using arithmetic and logical instructions to perform basic data processing operations.',
    programs: [
      asm(1, 'Add and subtract', 'Write an ARM7 assembly program to add and subtract two numbers stored in registers and store the results in another register.', 'e1p1_addsub.s', { output: 'R2 = 0x30, R3 = 0x10' }),
      asm(2, 'Multiply', 'Write an ARM7 assembly program to multiply two unsigned integers.', 'e1p2_mul.s', { output: 'R2 = 25 × 12 = 300 (0x12C)' }),
      asm(3, 'Y = A×B + C', 'Write an ARM7 assembly program to evaluate Y = A×B + C.', 'e1p3_mla.s', { output: 'R3 = 10 × 5 + 20 = 70 (0x46)' }),
      asm(4, 'Logical operations', 'Write a program to perform A AND B, A OR B and A XOR B on two 32-bit numbers.', 'e1p4_logic.s', {
        notes: ['Observe the error obtained on assembling this program and determine its reason. Then define 8-bit numbers for NUM1 and NUM2 (for example 0x78 and 0x11) and observe the output.',
          'MOV can only load an immediate that is an 8-bit value rotated by an even number of bits. 0x12345678 does not fit, so the assembler rejects it — LDR R0, =NUM1 would work.'],
      }),
      asm(5, "One's complement", "Write a program to obtain the one's complement of a 32-bit number.", 'e1p5_mvn.s', { output: 'R1 = 0xEDCBA987' }),
      asm(6, 'Clear bits 4–7', 'Write a program to clear selected bits 4–7 of a 32-bit number using a bit mask.', 'e1p6_bic.s', { output: 'R2 = 0xFFFFFF0F' }),
      asm(7, 'Set the low nibble', 'Write a program to set the least significant bits of a 32-bit number using the ORR instruction.', 'e1p7_orr.s', { output: 'R2 = 0x1234560F' }),
      asm(8, 'Multiply by shifting', 'Write a program to multiply a number by 2, 4 and 8 using logical left shifts.', 'e1p8_lsl.s', { output: 'R1 = 50, R2 = 100, R3 = 200' }),
      asm(9, 'Divide by a power of 2', 'Write a program to divide an unsigned number by a power of 2.', 'e1p9_lsr.s', { output: 'R1 = 80 / 2 = 40 (0x28)' }),
      asm(10, 'Rotate right', 'Write a program to rotate a 32-bit number right by four positions.', 'e1p10_ror.s', { output: 'R1 = 0x81234567' }),
    ],
    exercises: [
      asmX(1, 'Y = A + B − C', 'Write an assembly program to evaluate Y = A + B − C. Store the result in a register.', 'e1x1.s', 'R3 = 45 + 30 − 15 = 60 (0x3C)'),
      asmX(2, 'Y = (A + B) × C', 'Write a program to evaluate Y = (A + B) × C.', 'e1x2.s', 'R4 = (6 + 9) × 4 = 60 (0x3C)'),
      asmX(3, 'Toggle bits with EOR', 'Write a program to toggle selected bits using the EOR instruction.', 'e1x3.s', 'R2 = 0x12345687'),
      asmX(4, 'Test one bit', 'Write a program to check whether a specified bit of a number is 0 or 1.', 'e1x4.s', 'R3 = 1 (bit 3 of 0xA5C is set)'),
      asmX(5, 'Extract bits 8–15', 'Write a program to extract bits 8–15 from a 32-bit number.', 'e1x5.s', 'R1 = 0x56'),
      asmX(6, 'Signed ÷ 2 with ASR', 'Write a program to divide a signed number by 2 using an arithmetic right shift.', 'e1x6.s', 'R1 = −50 (0xFFFFFFCE); LSR would give 0x7FFFFFCE'),
      asmX(7, 'Swap the two bytes', 'Write a program to exchange the lower two bytes of a 16-bit number.', 'e1x7.s', 'R3 = 0x3412'),
    ],
  },
  {
    no: 2, slug: 'branching', lang: 'asm',
    title: 'ARM7 assembly language programming using conditional execution and branching',
    short: 'Conditions & branching',
    aim: 'To develop and execute ARM7 assembly language programs using conditional execution and branch instructions to perform data processing tasks.',
    programs: [
      asm(1, 'Positive, negative or zero', 'Write an assembly program to classify a signed number as Positive, Negative or Zero, and store a suitable code in a result register: 1 = positive, 0 = zero, −1 = negative.', 'e2p1_sign.s', { output: 'NUMBER = −25, so R1 = 0xFFFFFFFF (−1)', watch: ['NUMBER'] }),
      asm(2, 'Even or odd', 'Write an assembly language program to determine whether a given number is even or odd. Store 0 if even and 1 if odd, in data memory.', 'e2p2_evenodd.s', { output: 'RESULT = 1 (25 is odd)', watch: ['NUMBER', 'RESULT'] }),
      asm(3, 'Larger of two', 'Write an ARM7 assembly program to compare two unsigned numbers from data memory and save the larger number back to data memory.', 'e2p3_larger.s', { output: 'RESULT = 40 (0x28)', watch: ['NUM1', 'NUM2', 'RESULT'] }),
      asm(4, 'Sum of first N', 'Write an ARM7 assembly program to calculate the sum of the first N natural numbers.', 'e2p4_sumn.s', { output: 'RESULT = 55 (0x37) for N = 10', watch: ['N', 'RESULT'] }),
      asm(5, 'GCD by subtraction', 'Write an ARM7 assembly program to find the greatest common divisor (GCD) of two positive integers using repeated subtraction.', 'e2p5_gcd.s', { output: 'RESULT = GCD(48, 18) = 6', watch: ['NUM1', 'NUM2', 'RESULT'] }),
    ],
    exercises: [
      asmX(1, 'Divisible by 4?', 'Write an assembly language program to check whether a number is divisible by 4. (Hint: examine the two least significant bits using TST.)', 'e2x1.s', 'RESULT = 1 for 52'),
      asmX(2, 'Largest of three', 'Write an assembly language program to find the largest among three numbers and store the result in memory.', 'e2x2.s', 'LARGEST = 92 (0x5C)'),
      asmX(3, 'Sum of even numbers', 'Write an assembly language program to find the sum of all even numbers from 2 to N and store the result in memory.', 'e2x3.s', 'RESULT = 30 for N = 10'),
      asmX(4, 'Sum of odd numbers', 'Write an assembly language program to find the sum of all odd numbers from 1 to N.', 'e2x4.s', 'RESULT = 25 for N = 10'),
      asmX(5, 'Factorial', 'Write an assembly language program to calculate the factorial of a positive integer. (Use a small value of N to avoid 32-bit overflow.)', 'e2x5.s', 'RESULT = 6! = 720 (0x2D0)'),
      asmX(6, 'Power Xᴺ', 'Write an assembly language program to calculate the power of a number, Xᴺ, using repeated multiplication.', 'e2x6.s', 'RESULT = 3⁵ = 243 (0xF3)'),
    ],
  },
  {
    no: 3, slug: 'memory-arrays', lang: 'asm',
    title: 'ARM7 assembly language programming using memory and array operations',
    short: 'Memory & arrays',
    aim: 'To develop and execute ARM7 assembly language programs using indirect memory addressing for array processing.',
    programs: [
      asm(1, 'Multiplication table', 'Write an assembly language program to generate a multiplication table with the first ten multiples of a number. Store the results in consecutive memory locations (for 5: 5, 10, 15, …, 50).', 'e3p1_table.s', { output: 'RESULT … RESULT+36 = 5, 10, 15 … 50', watch: ['RESULT'] }),
      asm(2, 'Largest in an array', 'Write an assembly language program to find the largest value in an array of 5 elements.', 'e3p2_largest.s', { output: 'RESULT = 90 (0x5A)', watch: ['ARRAY', 'RESULT'] }),
      asm(3, 'Linear search', 'Write an assembly language program to search for a specified number in an array. Return the index of the element.', 'e3p3_search.s', { output: 'RESULT = 2 (40 is at index 2)', watch: ['ARRAY', 'RESULT'] }),
      asm(4, 'String length', 'Write an assembly language program to find the number of characters in a null-terminated string (do not include the null character).', 'e3p4_strlen.s', { output: 'COUNT = 12', watch: ['STRING', 'COUNT'] }),
      asm(5, 'Count a character', 'Write an assembly language program to count how many times a specified character occurs in a string.', 'e3p5_charcount.s', { output: "COUNT = 4 ('A' occurs four times)", watch: ['STRING', 'COUNT'] }),
    ],
    exercises: [
      asmX(1, 'Count even and odd', 'Write an assembly language program to count the number of even and odd values in an array. Store the two counts in separate memory locations.', 'e3x1.s', 'EVENS = 4, ODDS = 4'),
      asmX(2, 'Count +, −, 0', 'Write an assembly language program to count the number of positive, negative and zero values in a signed integer array. Store the counts in separate memory locations.', 'e3x2.s', 'POS = 3, NEG = 3, ZERO = 2'),
      asmX(3, 'Reverse copy', 'Write an assembly language program to copy the elements of an array of 5 elements into another array in reverse order.', 'e3x3.s', 'DST = 5, 4, 3, 2, 1'),
      asmX(4, 'To uppercase', 'Write an assembly language program to convert lowercase English letters in a string to uppercase.', 'e3x4.s', 'STR1 = "EMBEDDED SYSTEMS LAB 2026"'),
      asmX(5, 'Palindrome check', 'Write an assembly language program to determine whether a string is a palindrome.', 'e3x5.s', 'RESULT = 1 for "MALAYALAM"'),
      asmX(6, 'Bubble sort', 'Write an assembly language program to sort an array in ascending order.', 'e3x6.s', 'ARRAY = −7, 0, 3, 19, 44, 88'),
    ],
  },
  {
    no: 4, slug: 'subroutines-stack', lang: 'asm',
    title: 'ARM7 assembly language programming using subroutine and stack operations',
    short: 'Subroutines & stack',
    aim: 'To develop and execute ARM7 assembly language programs using subroutine and stack operations.',
    programs: [
      asm(1, 'Multiply in a subroutine', 'Write an ARM7 assembly program to multiply two numbers using a subroutine.', 'e4p1_mulsub.s', { output: 'RESULT = 25 × 15 = 375 (0x177)', watch: ['NUM', 'RESULT'], notes: ['The assembler warns that MUL R0, R0, R1 uses the same register for Rd and Rm. ARMv4 cores such as the ARM7TDMI do not guarantee the result; MUL R2, R0, R1 followed by MOV R0, R2 is the safe form.'] }),
      asm(2, 'Array sum in a subroutine', 'Write an ARM7 assembly program to find the sum of an array using a subroutine.', 'e4p2_arraysum.s', { output: 'RESULT = 150 (0x96)', watch: ['ARRAY', 'RESULT'] }),
      asm(3, 'Parameters on the stack', 'Write an ARM7 assembly program to find the sum of two numbers using stack-passed parameters.', 'e4p3_stackadd.s', { output: 'R4 = 12 + 8 = 20 (0x14)' }),
      asm(4, '64-bit addition', 'Write an ARM7 assembly program that uses a subroutine to add two 64-bit numbers. Preserve the original values of the registers used in the subroutine, using the stack.', 'e4p4_add64.s', { output: 'RESULT = 0x00000004_00000000', watch: ['NUM1', 'NUM2', 'RESULT'] }),
      asm(5, 'Multi-word transfer', 'Write an ARM7 assembly language program to demonstrate multi-word data transfer.', 'e4p5_multiword.s', { output: 'DEST holds the 15 words 1 … 0xF', watch: ['DEST'] }),
    ],
    exercises: [
      asmX(1, '16-bit add', 'Write an assembly language program to add two 16-bit numbers using a subroutine.', 'e4x1.s', 'RESULT = 0xFFFF + 0x1234 = 0x11233'),
      asmX(2, '16-bit subtract', 'Write an assembly language program to subtract two 16-bit numbers using a subroutine.', 'e4x2.s', 'RESULT = 0x5000 − 0x1234 = 0x3DCC'),
      asmX(3, '64 × 64-bit multiply', 'Write an assembly language program to multiply two 64-bit numbers using a subroutine.', 'e4x3.s', 'PRODUCT = 0x00000000_01234567_9BE02467_9ABCDEF0'),
      asmX(4, 'Recursive factorial', 'Write an assembly language program to find the factorial of a number using a subroutine.', 'e4x4.s', 'RESULT = 7! = 5040 (0x13B0)'),
      asmX(5, 'BCD addition', 'Write an assembly language program to find the sum of two 4-digit BCD (Binary Coded Decimal) numbers using a subroutine.', 'e4x5.s', 'RESULT = 4789 + 3456 = 0x8245'),
    ],
  },
  {
    no: 5, slug: 'gpio', lang: 'c',
    title: 'Programming LPC1768 for interfacing GPIO peripherals',
    short: 'GPIO: LEDs, buzzer, relay',
    aim: 'To configure and program the GPIO pins of the LPC1768 microcontroller for interfacing LED, buzzer and relay.',
    programs: [
      cprog(1, 'Blink the LEDs', 'Write a C program to blink the on-board LEDs connected to P0.4 to P0.11 of the LPC1768.', 'e5p1_blink.c', {
        algorithm: ALGO_GPIO, connections: ['Connect a 10-pin FRC cable from CNA to CNA1.'], wiring: W({ CNA: 'CNA1' }),
        output: 'The on-board LEDs LD2–LD9 blink.', devices: ['leds'],
      }),
      cprog(2, 'Buzzer', 'Write a C program to control the on-board buzzer of the LPC1768.', 'e5p2_buzzer.c', {
        algorithm: ['Initialise the board with SystemInit() and SystemCoreClockUpdate().', 'Make P0.11 a GPIO pin with LPC_PINCON->PINSEL0.', 'Make P0.11 an output with LPC_GPIO0->FIODIR.', 'Set and clear P0.11 with a delay between, in an endless loop.'],
        connections: ['Connect a 10-pin FRC cable from CNA to CNA5.'], wiring: W({ CNA: 'CNA5' }),
        output: 'The buzzer turns ON and OFF.', devices: ['buzzer'],
        notes: ['The buzzer is off by default. A HIGH on P0.11 switches transistor Q3 on, which powers the buzzer.', 'The printed listing uses delay_cnt without declaring it; the declaration has been added.'],
        tryIt: ['Unmute the bench (speaker icon) to hear the buzzer.'],
      }),
      cprog(3, 'Relay', 'Write a C program to control the on-board relay of the LPC1768.', 'e5p3_relay.c', {
        algorithm: ['Initialise the board with SystemInit() and SystemCoreClockUpdate().', 'Make P0.8 a GPIO pin with LPC_PINCON->PINSEL0.', 'Make P0.8 an output with LPC_GPIO0->FIODIR.', 'Set and clear P0.8 with a delay between, in an endless loop.'],
        connections: ['Connect a 10-pin FRC cable from CNA to CNA5.'], wiring: W({ CNA: 'CNA5' }),
        output: 'The relay switches ON and OFF; its LED follows, and CN12 pins 1–2 are shorted while it is on.', devices: ['relay'],
        notes: ['One side of the relay coil is pulled up; the other is driven from P0.8 through the ULN2803 inverting buffer. A HIGH on P0.8 energises the coil.'],
      }),
      cprog(4, '50% square wave', 'Write a C program to generate a PWM waveform of 50% duty cycle.', 'e5p4_square.c', {
        algorithm: ['Initialise the board with SystemInit() and SystemCoreClockUpdate().', 'Make P1.23 a GPIO pin with LPC_PINCON->PINSEL3.', 'Make P1.23 an output with LPC_GPIO1->FIODIR.', 'Set and clear P1.23 with equal delays, in an endless loop.'],
        connections: ['Connect a 10-pin FRC cable from CNB to CNB1.', 'Observe the waveform at TP5 on the CRO.'], wiring: W({ CNB: 'CNB1' }),
        output: 'A square wave of 3.3 V amplitude and 50% duty cycle on the CRO.', devices: ['ld10', 'scope'], scope: { a: 'P1.23', tb: 20 },
        tryIt: ['Open the Scope tab: channel A is probing TP5 (P1.23).'],
      }),
    ],
    exercises: [
      cX(1, 'Ring counter', 'Write a program to display a ring counter on the on-board LEDs of the LPC1768.', 'e5x1.c', { wiring: W({ CNA: 'CNA1' }), devices: ['leds'] }),
      cX(2, 'Johnson counter', 'Write a program to display a Johnson counter on the on-board LEDs of the LPC1768.', 'e5x2.c', { wiring: W({ CNA: 'CNA1' }), devices: ['leds'] }),
      cX(3, '4-bit hex counter', 'Write a program to display a 4-bit hex counter on the on-board LEDs of the LPC1768.', 'e5x3.c', { wiring: W({ CNA: 'CNA1' }), devices: ['leds'] }),
      cX(4, 'Musical tones', 'Write a program to generate different musical tones using the on-board buzzer of the LPC1768.', 'e5x4.c', { wiring: W({ CNA: 'CNA5' }), devices: ['buzzer'], speed: 4, scope: { a: 'P0.11', tb: 2 }, tryIt: ['Unmute the bench to hear the C-major scale.'], notes: ['Timer 0 times each half period, so the pitch stays correct whatever the CPU speed setting.'] }),
      cX(5, '75% duty cycle', 'Write a program to generate a PWM wave of 75% duty cycle.', 'e5x5.c', { wiring: W({ CNB: 'CNB1' }), devices: ['ld10', 'scope'], scope: { a: 'P1.23', tb: 2 } }),
      cX(6, 'PWM buzzer on P1.23', 'Write a program to control an external buzzer using PWM generated at P1.23.', 'e5x6.c', { wiring: W({ CNB: 'CNB1' }), devices: ['ld10', 'scope'], scope: { a: 'P1.23', tb: 1 }, tryIt: ['In the Scope tab, switch on "Listen to channel A" to hear the external buzzer on TP5.'] }),
    ],
  },
  {
    no: 6, slug: 'displays', lang: 'c',
    title: 'Programming LPC1768 for interfacing display devices',
    short: 'LCD & 7-segment',
    aim: 'To program the LPC1768 microcontroller for interfacing an LCD display and a 7-segment display.',
    programs: [
      cprog(1, 'LCD message', 'Write a C program to interface a 16×2 LCD with LPC1768 and display the message "ECE,MIT,MANIPAL".', 'e6p1_lcd.c', {
        algorithm: [
          'Initialise the board with SystemInit() and SystemCoreClockUpdate().',
          'Make P0.23–P0.28 GPIO outputs (PINSEL1 and FIODIR).',
          'LCD_data1() and LCD_cmd1() put one 4-bit nibble on D4–D7, set RS, and pulse EN.',
          'LCD_data() and LCD_cmd() send a byte as two nibbles, high nibble first.',
          'lcd_init() runs the manufacturer\'s 4-bit initialisation sequence (0x03, 0x03, 0x03, 0x02, then 0x28, 0x0C, 0x06).',
          'main() clears the display and sends the message one character at a time.',
        ],
        connections: ['Connect a 10-pin FRC cable from CND to CNAD.', 'Keep JP16 (LCD enable) and JP5 (P0.26 → D7) closed.'], wiring: W({ CND: 'CNAD' }),
        output: 'The message "ECE,MIT,MANIPAL" is displayed on the LCD.', devices: ['lcd'],
        notes: ['D4–D7 = P0.23–P0.26, RS = P0.27, EN = P0.28, RW = GND.', 'The printed listing never makes P0.23–P0.28 outputs; lcd_init() now sets PINSEL1 and FIODIR.', 'z[15] has no room for the terminating \'\\0\' of the 15-character message, so LCD_puts() would run past it; the array is now z[16].'],
      }),
      cprog(2, 'HELP on 7-segment', 'Write a C program to display "HELP" on the on-board seven-segment display.', 'e6p2_help.c', {
        algorithm: ['Define the digit-select codes.', 'Initialise the board.', 'Make P0.4–P0.11 (segments) and P1.23–P1.26 (digit select) GPIO outputs.', 'For each digit: put the segment pattern on port 0, select the digit on port 1, and wait briefly. Repeating this fast makes all four digits appear lit at once.'],
        connections: ['Connect 10-pin FRC cables from CNA to CNA2 and from CNB to CNB2.'], wiring: W({ CNA: 'CNA2', CNB: 'CNB2' }),
        output: '"HELP" is displayed on the seven-segment display.', devices: ['seg'],
        notes: ['Common-cathode displays: segments are active high. Segments a–h are on P0.4–P0.11; P1.23–P1.26 select a digit through a decoder (0–3 = digits, 4 = none).'],
      }),
    ],
    exercises: [
      cX(1, 'Flash "ECE"', 'Write a program to flash "ECE" on the on-board 7-segment display.', 'e6x1.c', { wiring: W({ CNA: 'CNA2', CNB: 'CNB2' }), devices: ['seg'] }),
      cX(2, 'Scroll on the LCD', 'Write a program to scroll the message "ECE,MIT" on the on-board LCD.', 'e6x2.c', { wiring: W({ CND: 'CNAD' }), devices: ['lcd'] }),
    ],
  },
  {
    no: 7, slug: 'data-converters', lang: 'c',
    title: 'Programming LPC1768 for interfacing data converters',
    short: 'ADC & DAC',
    aim: 'To program the LPC1768 microcontroller for interfacing the ADC and DAC.',
    programs: [
      {
        ...cprog(1, 'ADC on the LCD', 'Using the built-in 12-bit ADC of the LPC1768, write a program to convert an analog voltage to digital and display the output on a 16×2 alphanumeric LCD.', 'e7p1_adc.c'),
        files: { 'main.c': src('e7p1_adc.c'), ...lcdFiles() },
        algorithm: [
          'Channel AD0.4 is scanned. The voltage on P1.30 is varied with POT4; with a 3.3 V reference the result spans 000–FFF.',
          'The LCD routines from Experiment 6 live in lcd.c, with their declarations in AN_LCD.h.',
          'Power the ADC (PCONP bit 12) and select AD0.4 on P1.30 (PINSEL3).',
          'Start a conversion, wait for DONE, read the 12-bit result from ADGDR bits 4–15.',
          'Convert to volts, format with sprintf() and show both values on the LCD.',
        ],
        connections: ['Connect a 10-pin FRC cable from CND to CNAD.', 'Short jumpers JP16, JP5 and JP18 (2-3).'], wiring: W({ CND: 'CNAD' }),
        output: 'Turning POT4 changes the analog and digital values shown on the LCD.', devices: ['lcd', 'adc'],
        tryIt: ['Drag the AD0.4 knob (POT4) and watch the LCD update.'],
      },
      cprog(2, 'DAC ramp', 'Using the internal DAC of the LPC1768, write a program to generate a ramp wave.', 'e7p2_dac.c', {
        algorithm: ['The LPC1768 has a 10-bit DAC on P0.26.', 'Select AOUT on P0.26 with PINSEL1.', 'Configure DACCTRL and DACCNTVAL.', 'Write increasing values to DACR (bits 6–15); the output voltage rises in steps and wraps back to 0.'],
        connections: ['Open jumper JP5.', 'Observe the analog output at TP8 with a multimeter or CRO.'], wiring: W({}, { JP5: false }),
        output: 'A ramp (sawtooth) at TP8.', devices: ['dac', 'scope'], scope: { b: 'DAC', tb: 100 },
        notes: ['The variable i is used uninitialised in the printed listing; it now starts at 0.'],
        tryIt: ['Open the Scope tab: channel B probes TP8 (DAC output).'],
      }),
    ],
    exercises: [
      cX(1, 'ADC in hex on 7-segment', 'Write a program to convert an analog voltage into digital using the built-in ADC of the LPC1768 and display the output (in hexadecimal) on the seven-segment display at an interval of 2 seconds.', 'e7x1.c', { wiring: W({ CNA: 'CNA2', CNB: 'CNB2' }), devices: ['seg', 'adc'], speed: 4 }),
      cX(2, 'DAC square wave', 'Write a program to generate a square wave of 2 kHz frequency with 75% duty cycle using the built-in DAC of the LPC1768.', 'e7x2.c', { wiring: W({}, { JP5: false }), devices: ['dac', 'scope'], speed: 8, scope: { b: 'DAC', tb: 0.2 } }),
      cX(3, 'DAC sine wave', 'Write a program to generate a sinusoidal waveform of 3 V amplitude and 1 kHz frequency using the built-in DAC of the LPC1768.', 'e7x3.c', { wiring: W({}, { JP5: false }), devices: ['dac', 'scope'], speed: 16, scope: { b: 'DAC', tb: 0.5 }, notes: ['The DAC reference is 3.3 V, so "3 V amplitude" is taken as 3 V peak-to-peak around 1.65 V.', 'This program updates the DAC every 25 µs, so it is tuned to run at 16× speed.'] }),
    ],
  },
  {
    no: 8, slug: 'keypad-uart', lang: 'c',
    title: 'Programming LPC1768 for interfacing keypad and UART',
    short: 'Keypad & UART',
    aim: 'To program the LPC1768 microcontroller for interfacing a hex keypad and UART serial communication.',
    programs: [
      cprog(1, '1×4 keys drive counters', 'Write a C program to interface a 1×4 key matrix and 4 LEDs with LPC1768. K1: right-shift 4-bit ring counter, K2: left-shift 4-bit ring counter, K3: BCD down counter, K4: BCD up counter.', 'e8p1_keys.c', {
        algorithm: ['Initialise the board.', 'Make the LED pins (P0.4–P0.11) and row pins (P2.10–P2.13) outputs.', 'Clear the LEDs and drive row 1 HIGH.', 'Read the columns from P1.23–P1.26 with FIOPIN.', 'AND the reading with each column mask to find the key, and run that key\'s counter on the LEDs.'],
        connections: ['Connect a 10-pin FRC cable from CNB to CNB3.', 'Connect a 10-pin FRC cable from CNA to CNA1.'], wiring: W({ CNA: 'CNA1', CNB: 'CNB3' }),
        output: 'The counter for each key of the first row runs on the LEDs while the key is pressed.', devices: ['keypad', 'leds'],
        notes: ['Columns 1–4 are on P1.23–P1.26 and rows 1–4 on P2.10–P2.13.'],
        tryIt: ['Hold K1–K4 (the top row of the keypad) — or press keys 1, 2, 3, 4 on your keyboard.'],
      }),
      cprog(2, 'UART echo', 'Write a C program to enable LPC1768 to communicate serially with a PC.', 'e8p2_uart.c', {
        algorithm: ['A character received from the PC terminal on UART3 is sent straight back.', 'P0.0 = TXD3, P0.1 = RXD3. Power UART3 (PCONP bit 25) and select the pin functions.', 'Set 8 data bits, 1 stop bit, no parity and the baud-rate divisor (DLAB = 1, DLL = 0x13).', 'Enable the transmit and receive interrupts; the ISR sets flags that main() waits on.'],
        connections: ['Short jumpers JP7 (1,2) and JP8 (1,2).', 'Connect RM1 to the 9-pin DSUB cross cable and the cable to the PC; use the default terminal settings.'], wiring: W({}),
        output: 'Characters typed in the PC terminal are echoed back by the board.', devices: ['uart'], terminal: 3,
        tryIt: ['Open the Serial tab and type — each key is sent to UART3 and echoed back.'],
      }),
    ],
    exercises: [
      cX(1, 'Keys play tones', 'Interface the on-board 1×4 key matrix and buzzer with LPC1768. Write a program to generate different tones based on the key pressed.', 'e8x1.c', { wiring: W({ CNA: 'CNA5', CNB: 'CNB3' }), devices: ['keypad', 'buzzer'], speed: 4, tryIt: ['Unmute, then hold K1–K4.'] }),
      cX(2, 'Keys show messages', 'Interface the on-board 2×4 key matrix and LCD with LPC1768. Write a program to display different messages depending on the key pressed.', 'e8x2.c', { wiring: W({ CND: 'CNAD', CNB: 'CNB3' }), devices: ['keypad', 'lcd'] }),
      cX(3, 'Key code on 7-segment', 'Interface the on-board 4×4 key matrix and 7-segment displays with LPC1768. Write a program to display the key pressed on the 7-segment display.', 'e8x3.c', { wiring: W({ CNA: 'CNA2', CNB: 'CNB3', CNC: 'CNB2' }), devices: ['keypad', 'seg'], notes: ['Both the key matrix and the digit select normally use CNB, so the digit select is wired from CNC (P0.15–P0.18) instead.'] }),
      cX(4, 'Serial to LCD', 'Write a program for the LPC1768 to receive characters serially from the PC keyboard and display them on the alphanumeric LCD.', 'e8x4.c', { wiring: W({ CND: 'CNAD' }), devices: ['lcd', 'uart'], terminal: 3 }),
      cX(5, 'ADC over serial', 'Write a program for the LPC1768 to display the output of the built-in ADC serially on the PC terminal.', 'e8x5.c', { wiring: W({}), devices: ['adc', 'uart'], terminal: 3 }),
    ],
  },
  {
    no: 9, slug: 'motors', lang: 'c',
    title: 'Programming LPC1768 for interfacing stepper and DC motors',
    short: 'Stepper & DC motor',
    aim: 'To program the LPC1768 microcontroller for interfacing a stepper motor and a DC motor.',
    programs: [
      cprog(1, 'Stepper direction', 'Write a C program to control the direction of a stepper motor.', 'e9p1_stepper.c', {
        algorithm: ['Make P0.4–P0.7 GPIO outputs.', 'The direction is set by the order in which the coils are energised.', 'The motor turns clockwise first, then anticlockwise.', 'The delay between steps sets the speed.'],
        connections: ['Connect a 10-pin FRC cable from CNA to CNA5.'], wiring: W({ CNA: 'CNA5' }),
        output: 'The motor rotates clockwise, then anticlockwise.', devices: ['stepper'],
        notes: ['50 calls × 4 steps × 1.8° = one full revolution in each direction.'],
      }),
      cprog(2, 'DC motor direction', 'Write a C program to rotate the DC motor clockwise and anticlockwise.', 'e9p2_dc.c', {
        algorithm: ['The direction is reversed by swapping the supply to the motor.', 'Make P0.9 (on/off) and P0.10 (direction) GPIO outputs.', 'Turn the motor off, wait for it to coast, set the direction and turn it back on.'],
        connections: ['Connect a 10-pin FRC cable from CNA to CNA5.'], wiring: W({ CNA: 'CNA5' }),
        output: 'The motor rotates in both directions.', devices: ['dc'],
      }),
    ],
    exercises: [
      cX(1, 'Stepper 180° anticlockwise', 'Write a program to rotate the stepper motor anticlockwise by 180 degrees.', 'e9x1.c', { wiring: W({ CNA: 'CNA5' }), devices: ['stepper'] }),
      cX(2, 'DC motor speed control', 'Write a program to control the speed of the DC motor: some time at low speed, then medium speed, then high speed, and repeat.', 'e9x2.c', { wiring: W({ CNA: 'CNA5' }), devices: ['dc'] }),
    ],
  },
  {
    no: 10, slug: 'interrupts', lang: 'c',
    title: 'Programming LPC1768 for interfacing external hardware interrupts',
    short: 'External interrupts',
    aim: 'To program the LPC1768 microcontroller for interfacing external hardware interrupts.',
    programs: [
      cprog(1, 'Toggle LED on EINT2', 'Write a program to toggle an LED using an external hardware interrupt.', 'e10p1_eint.c', {
        algorithm: ['Configure P2.12 as external interrupt 2 (PINSEL4).', 'Set EXTINT, EXTMODE and EXTPOLAR for a falling-edge interrupt.', 'Enable it with NVIC_EnableIRQ(EINT2_IRQn).', 'EINT2_IRQHandler() sets a flag and clears the interrupt; main() toggles LD10 when it sees the flag.'],
        connections: ['Connect a 10-pin FRC cable from CNB to CNB1.'], wiring: W({ CNB: 'CNB1' }),
        output: 'Each press of SW2 toggles LD10.', devices: ['sw2', 'ld10'],
        tryIt: ['Click SW2 (or press the space bar) to fire EINT2.'],
      }),
    ],
    exercises: [
      cX(1, 'EINT2 reverses the stepper', 'Using EXTINT2, interface a stepper motor so that the first interrupt rotates the motor clockwise, the next interrupt anticlockwise, and so on.', 'e10x1.c', { wiring: W({ CNA: 'CNA5', CNB: 'CNB1' }), devices: ['sw2', 'stepper'] }),
      cX(2, 'EINT2 reverses the DC motor', 'Repeat exercise 1 with the DC motor.', 'e10x2.c', { wiring: W({ CNA: 'CNA5', CNB: 'CNB1' }), devices: ['sw2', 'dc'] }),
      cX(3, 'EINT2 sets the speed', 'No interrupt: motor off. First interrupt: low speed. Second: medium speed. Third: high speed. Next: off, and so on.', 'e10x3.c', { wiring: W({ CNA: 'CNA5', CNB: 'CNB1' }), devices: ['sw2', 'dc'] }),
      cX(4, 'EINT2 sequences the motors', 'No interrupt: motors off. First: stepper clockwise. Second: stepper anticlockwise. Third: DC motor clockwise. Fourth: DC motor anticlockwise. Next: off, and so on.', 'e10x4.c', { wiring: W({ CNA: 'CNA5', CNB: 'CNB1' }), devices: ['sw2', 'stepper', 'dc'] }),
    ],
  },
];

export function findProgram(expNo: number, id: string): { exp: Experiment; prog: Program } | null {
  const exp = EXPERIMENTS.find(e => e.no === expNo);
  if (!exp) return null;
  const prog = [...exp.programs, ...exp.exercises].find(p => p.id === id);
  return prog ? { exp, prog } : null;
}

export const PLAYGROUND_C = `#include <LPC17xx.h>

// Scratch file: write anything you like.
// The board starts with every cable unplugged — wire it from the Board panel.

unsigned int i;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    LPC_GPIO0->FIODIR |= 0x00000FF0;

    while (1)
    {
        LPC_GPIO0->FIOPIN ^= 0x00000FF0;
        for (i = 0; i < 40000; i++);
    }
}
`;

export const PLAYGROUND_ASM = `    AREA SCRATCH, CODE, READONLY
    ENTRY
        MOV  R0, #10
        MOV  R1, #0
LOOP    ADD  R1, R1, R0
        SUBS R0, R0, #1
        BNE  LOOP
STOP    B    STOP
    END
`;
