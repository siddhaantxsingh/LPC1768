// Send the ADC reading (AD0.4 / POT4) to the PC over UART3 twice a second.
#include <LPC17xx.h>
#include <stdio.h>

// Peripheral clock of a timer/UART, read from the chip so all timing stays correct
// whatever clock the board actually runs at. PCLKSEL field: 00 = CCLK/4, 01 = CCLK,
// 10 = CCLK/2, 11 = CCLK/8. (SystemCoreClock is set by SystemCoreClockUpdate().)
unsigned int pclk(unsigned int pclksel, unsigned int shift)
{
    unsigned int sel = (pclksel >> shift) & 3;
    return SystemCoreClock / (sel == 0 ? 4 : sel == 1 ? 1 : sel == 2 ? 2 : 8);
}

// Microsecond delay using Timer 0: the prescaler is computed from the real clock
void delay_us(unsigned int us)
{
    LPC_TIM0->TCR = 0x02;                                   // reset the counter
    LPC_TIM0->PR  = pclk(LPC_SC->PCLKSEL0, 2) / 1000000 - 1; // 1 tick = 1 us
    LPC_TIM0->TCR = 0x01;                                   // start
    while (LPC_TIM0->TC < us);
    LPC_TIM0->TCR = 0x00;                                   // stop
}

void uart3_init(void)
{
    unsigned int divisor;
    LPC_SC->PCONP |= (1 << 25);
    LPC_PINCON->PINSEL0 &= ~0x0F;
    LPC_PINCON->PINSEL0 |=  0x0A;
    divisor = pclk(LPC_SC->PCLKSEL1, 18) / (16 * 9600);   // 9600 baud at any clock
    LPC_UART3->LCR = 0x83;                      // DLAB = 1
    LPC_UART3->DLM = divisor >> 8;
    LPC_UART3->DLL = divisor & 0xFF;
    LPC_UART3->LCR = 0x03;                      // 8N1, DLAB = 0
    LPC_UART3->FCR = 0x07;
}

void uart3_puts(char *s)
{
    while (*s)
    {
        while (!(LPC_UART3->LSR & 0x20));       // wait until THR is empty
        LPC_UART3->THR = *s++;
    }
}

int main(void)
{
    unsigned int v;
    char buf[40];

    SystemInit();
    SystemCoreClockUpdate();
    uart3_init();
    LPC_SC->PCONP |= (1 << 12);
    LPC_PINCON->PINSEL3 |= (3 << 28);           // P1.30 = AD0.4

    while (1)
    {
        LPC_ADC->ADCR = (1 << 4) | (4 << 8) | (1 << 21) | (1 << 24);
        while (!((v = LPC_ADC->ADGDR) & 0x80000000));
        v = (v >> 4) & 0xFFF;
        sprintf(buf, "ADC = 0x%03X  (%4.2f V)\r\n", v, v * 3.3 / 4095);
        uart3_puts(buf);
        delay_us(500000);
    }
}
