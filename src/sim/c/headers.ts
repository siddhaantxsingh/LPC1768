// Built-in headers. The register layouts follow the CMSIS LPC17xx.h definitions so
// that student code using LPC_GPIO0->FIOSET, LPC_ADC->ADGDR etc. compiles unchanged.

const STDINT = `
#ifndef __STDINT_H
#define __STDINT_H
typedef signed char int8_t;
typedef unsigned char uint8_t;
typedef short int16_t;
typedef unsigned short uint16_t;
typedef int int32_t;
typedef unsigned int uint32_t;
typedef long long int64_t;
typedef unsigned long long uint64_t;
typedef unsigned int size_t;
typedef unsigned int uintptr_t;
typedef int intptr_t;
#define UINT8_MAX 255
#define UINT16_MAX 65535
#define UINT32_MAX 4294967295U
#define INT32_MAX 2147483647
#define INT32_MIN (-2147483647-1)
#endif
`;

const STDBOOL = `
#ifndef __STDBOOL_H
#define __STDBOOL_H
#define bool _Bool
#define true 1
#define false 0
#endif
`;

function regs(names: string[], type = 'uint32_t', q = '__IO') {
  return names.map(n => `  ${q} ${type} ${n};`).join('\n');
}

function gpioReg(name: string) {
  return `  union {
    __IO uint32_t ${name};
    struct { __IO uint16_t ${name}L; __IO uint16_t ${name}H; };
    struct { __IO uint8_t ${name}0; __IO uint8_t ${name}1; __IO uint8_t ${name}2; __IO uint8_t ${name}3; };
  };`;
}

const LPC17XX = `
#ifndef __LPC17xx_H__
#define __LPC17xx_H__
${STDINT}
#define __I volatile const
#define __O volatile
#define __IO volatile

typedef enum IRQn {
  NonMaskableInt_IRQn = -14, MemoryManagement_IRQn = -12, BusFault_IRQn = -11,
  UsageFault_IRQn = -10, SVCall_IRQn = -5, DebugMonitor_IRQn = -4, PendSV_IRQn = -2,
  SysTick_IRQn = -1,
  WDT_IRQn = 0, TIMER0_IRQn = 1, TIMER1_IRQn = 2, TIMER2_IRQn = 3, TIMER3_IRQn = 4,
  UART0_IRQn = 5, UART1_IRQn = 6, UART2_IRQn = 7, UART3_IRQn = 8, PWM1_IRQn = 9,
  I2C0_IRQn = 10, I2C1_IRQn = 11, I2C2_IRQn = 12, SPI_IRQn = 13, SSP0_IRQn = 14,
  SSP1_IRQn = 15, PLL0_IRQn = 16, RTC_IRQn = 17, EINT0_IRQn = 18, EINT1_IRQn = 19,
  EINT2_IRQn = 20, EINT3_IRQn = 21, ADC_IRQn = 22, BOD_IRQn = 23, USB_IRQn = 24,
  CAN_IRQn = 25, DMA_IRQn = 26, I2S_IRQn = 27, ENET_IRQn = 28, RIT_IRQn = 29,
  MCPWM_IRQn = 30, QEI_IRQn = 31, PLL1_IRQn = 32, USBActivity_IRQn = 33, CANActivity_IRQn = 34
} IRQn_Type;

typedef struct {
${gpioReg('FIODIR')}
  uint32_t RESERVED0[3];
${gpioReg('FIOMASK')}
${gpioReg('FIOPIN')}
${gpioReg('FIOSET')}
${gpioReg('FIOCLR')}
} LPC_GPIO_TypeDef;

typedef struct {
${regs(['PINSEL0', 'PINSEL1', 'PINSEL2', 'PINSEL3', 'PINSEL4', 'PINSEL5', 'PINSEL6', 'PINSEL7', 'PINSEL8', 'PINSEL9', 'PINSEL10'])}
  uint32_t RESERVED0[5];
${regs(['PINMODE0', 'PINMODE1', 'PINMODE2', 'PINMODE3', 'PINMODE4', 'PINMODE5', 'PINMODE6', 'PINMODE7', 'PINMODE8', 'PINMODE9'])}
${regs(['PINMODE_OD0', 'PINMODE_OD1', 'PINMODE_OD2', 'PINMODE_OD3', 'PINMODE_OD4', 'I2CPADCFG'])}
} LPC_PINCON_TypeDef;

typedef struct {
  __IO uint32_t FLASHCFG;
  uint32_t RESERVED0[31];
  __IO uint32_t PLL0CON;
  __IO uint32_t PLL0CFG;
  __I  uint32_t PLL0STAT;
  __O  uint32_t PLL0FEED;
  uint32_t RESERVED1[4];
  __IO uint32_t PLL1CON;
  __IO uint32_t PLL1CFG;
  __I  uint32_t PLL1STAT;
  __O  uint32_t PLL1FEED;
  uint32_t RESERVED2[4];
  __IO uint32_t PCON;
  __IO uint32_t PCONP;
  uint32_t RESERVED3[15];
  __IO uint32_t CCLKCFG;
  __IO uint32_t USBCLKCFG;
  __IO uint32_t CLKSRCSEL;
  __IO uint32_t CANSLEEPCLR;
  __IO uint32_t CANWAKEFLAGS;
  uint32_t RESERVED4[10];
  __IO uint32_t EXTINT;
  uint32_t RESERVED5;
  __IO uint32_t EXTMODE;
  __IO uint32_t EXTPOLAR;
  uint32_t RESERVED6[12];
  __IO uint32_t RSID;
  uint32_t RESERVED7[7];
  __IO uint32_t SCS;
  __IO uint32_t IRCTRIM;
  __IO uint32_t PCLKSEL0;
  __IO uint32_t PCLKSEL1;
  uint32_t RESERVED8[4];
  __IO uint32_t USBIntSt;
  __IO uint32_t DMAREQSEL;
  __IO uint32_t CLKOUTCFG;
} LPC_SC_TypeDef;

typedef struct {
  __IO uint32_t ADCR;
  __IO uint32_t ADGDR;
  uint32_t RESERVED0;
  __IO uint32_t ADINTEN;
  __I  uint32_t ADDR0;
  __I  uint32_t ADDR1;
  __I  uint32_t ADDR2;
  __I  uint32_t ADDR3;
  __I  uint32_t ADDR4;
  __I  uint32_t ADDR5;
  __I  uint32_t ADDR6;
  __I  uint32_t ADDR7;
  __I  uint32_t ADSTAT;
  __IO uint32_t ADTRM;
} LPC_ADC_TypeDef;

typedef struct {
  __IO uint32_t DACR;
  __IO uint32_t DACCTRL;
  __IO uint16_t DACCNTVAL;
} LPC_DAC_TypeDef;

typedef struct {
  union { __I uint8_t RBR; __O uint8_t THR; __IO uint8_t DLL; uint32_t RESERVED0; };
  union { __IO uint8_t DLM; __IO uint32_t IER; };
  union { __I uint32_t IIR; __O uint8_t FCR; };
  __IO uint8_t LCR;
  uint8_t RESERVED1[7];
  __I uint8_t LSR;
  uint8_t RESERVED2[7];
  __IO uint8_t SCR;
  uint8_t RESERVED3[3];
  __IO uint32_t ACR;
  __IO uint8_t ICR;
  uint8_t RESERVED4[3];
  __IO uint8_t FDR;
  uint8_t RESERVED5[7];
  __IO uint8_t TER;
} LPC_UART_TypeDef;

typedef struct {
  union { __I uint8_t RBR; __O uint8_t THR; __IO uint8_t DLL; uint32_t RESERVED0; };
  union { __IO uint8_t DLM; __IO uint32_t IER; };
  union { __I uint32_t IIR; __O uint8_t FCR; };
  __IO uint8_t LCR;
  uint8_t RESERVED1[3];
  __IO uint8_t MCR;
  uint8_t RESERVED2[3];
  __I uint8_t LSR;
  uint8_t RESERVED3[3];
  __I uint8_t MSR;
  uint8_t RESERVED4[3];
  __IO uint8_t SCR;
  uint8_t RESERVED5[3];
  __IO uint32_t ACR;
  uint32_t RESERVED6;
  __IO uint32_t FDR;
  uint32_t RESERVED7;
  __IO uint8_t TER;
} LPC_UART1_TypeDef;

typedef struct {
  __IO uint32_t IR;
  __IO uint32_t TCR;
  __IO uint32_t TC;
  __IO uint32_t PR;
  __IO uint32_t PC;
  __IO uint32_t MCR;
  __IO uint32_t MR0;
  __IO uint32_t MR1;
  __IO uint32_t MR2;
  __IO uint32_t MR3;
  __IO uint32_t CCR;
  __I  uint32_t CR0;
  __I  uint32_t CR1;
  uint32_t RESERVED0[2];
  __IO uint32_t EMR;
  uint32_t RESERVED1[12];
  __IO uint32_t CTCR;
} LPC_TIM_TypeDef;

typedef struct {
  __IO uint32_t IR;
  __IO uint32_t TCR;
  __IO uint32_t TC;
  __IO uint32_t PR;
  __IO uint32_t PC;
  __IO uint32_t MCR;
  __IO uint32_t MR0;
  __IO uint32_t MR1;
  __IO uint32_t MR2;
  __IO uint32_t MR3;
  __IO uint32_t CCR;
  __I  uint32_t CR0;
  __I  uint32_t CR1;
  __I  uint32_t CR2;
  __I  uint32_t CR3;
  uint32_t RESERVED0;
  __IO uint32_t MR4;
  __IO uint32_t MR5;
  __IO uint32_t MR6;
  __IO uint32_t PCR;
  __IO uint32_t LER;
  uint32_t RESERVED1[7];
  __IO uint32_t CTCR;
} LPC_PWM_TypeDef;

typedef struct {
  __I  uint32_t IntStatus;
  __I  uint32_t IO0IntStatR;
  __I  uint32_t IO0IntStatF;
  __O  uint32_t IO0IntClr;
  __IO uint32_t IO0IntEnR;
  __IO uint32_t IO0IntEnF;
  uint32_t RESERVED0[3];
  __I  uint32_t IO2IntStatR;
  __I  uint32_t IO2IntStatF;
  __O  uint32_t IO2IntClr;
  __IO uint32_t IO2IntEnR;
  __IO uint32_t IO2IntEnF;
} LPC_GPIOINT_TypeDef;

typedef struct {
  __IO uint32_t RICOMPVAL;
  __IO uint32_t RIMASK;
  __IO uint8_t  RICTRL;
  uint8_t RESERVED0[3];
  __IO uint32_t RICOUNTER;
} LPC_RIT_TypeDef;

typedef struct {
  __IO uint32_t CTRL;
  __IO uint32_t LOAD;
  __IO uint32_t VAL;
  __I  uint32_t CALIB;
} SysTick_Type;

#define LPC_GPIO0   ((LPC_GPIO_TypeDef *) 0x2009C000)
#define LPC_GPIO1   ((LPC_GPIO_TypeDef *) 0x2009C020)
#define LPC_GPIO2   ((LPC_GPIO_TypeDef *) 0x2009C040)
#define LPC_GPIO3   ((LPC_GPIO_TypeDef *) 0x2009C060)
#define LPC_GPIO4   ((LPC_GPIO_TypeDef *) 0x2009C080)
#define LPC_PINCON  ((LPC_PINCON_TypeDef *) 0x4002C000)
#define LPC_SC      ((LPC_SC_TypeDef *) 0x400FC000)
#define LPC_ADC     ((LPC_ADC_TypeDef *) 0x40034000)
#define LPC_DAC     ((LPC_DAC_TypeDef *) 0x4008C000)
#define LPC_UART0   ((LPC_UART_TypeDef *) 0x4000C000)
#define LPC_UART1   ((LPC_UART1_TypeDef *) 0x40010000)
#define LPC_UART2   ((LPC_UART_TypeDef *) 0x40098000)
#define LPC_UART3   ((LPC_UART_TypeDef *) 0x4009C000)
#define LPC_TIM0    ((LPC_TIM_TypeDef *) 0x40004000)
#define LPC_TIM1    ((LPC_TIM_TypeDef *) 0x40008000)
#define LPC_TIM2    ((LPC_TIM_TypeDef *) 0x40090000)
#define LPC_TIM3    ((LPC_TIM_TypeDef *) 0x40094000)
#define LPC_PWM1    ((LPC_PWM_TypeDef *) 0x40018000)
#define LPC_GPIOINT ((LPC_GPIOINT_TypeDef *) 0x40028080)
#define LPC_RIT     ((LPC_RIT_TypeDef *) 0x400B0000)
#define SysTick     ((SysTick_Type *) 0xE000E010)

#define SysTick_CTRL_ENABLE_Msk    (1UL << 0)
#define SysTick_CTRL_TICKINT_Msk   (1UL << 1)
#define SysTick_CTRL_CLKSOURCE_Msk (1UL << 2)
#define SysTick_CTRL_COUNTFLAG_Msk (1UL << 16)

extern uint32_t SystemCoreClock;
void SystemInit(void);
void SystemCoreClockUpdate(void);
#endif
`;

const STDIO = `
#ifndef __STDIO_H
#define __STDIO_H
#define EOF (-1)
#endif
`;

const EMPTY = `\n`;

const MATH = `
#ifndef __MATH_H
#define __MATH_H
#define M_PI 3.14159265358979323846
#define PI 3.14159265358979323846
#endif
`;

export function builtinHeader(name: string): string | null {
  const n = name.toLowerCase().replace(/\\/g, '/').split('/').pop()!;
  switch (n) {
    case 'lpc17xx.h':
    case 'lpc17xx.h ':
      return LPC17XX;
    case 'system_lpc17xx.h':
    case 'core_cm3.h':
    case 'cmsis.h':
      return LPC17XX;
    case 'stdint.h': return STDINT;
    case 'stdbool.h': return STDBOOL;
    case 'stdio.h': return STDIO;
    case 'math.h': return MATH;
    case 'stdlib.h':
    case 'string.h':
    case 'ctype.h':
    case 'stdarg.h':
    case 'limits.h':
    case 'type.h':
      return EMPTY;
    default: return null;
  }
}
