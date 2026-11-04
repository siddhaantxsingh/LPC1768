// Send the ADC reading (AD0.4 / POT4) to the PC over UART3 twice a second.
#include <LPC17xx.h>
#include <stdio.h>

// Microsecond delay using Timer 0 (PCLK = 25 MHz -> prescale 25 gives 1 us ticks)
void delay_us(unsigned int us)
{
    LPC_TIM0->TCR = 0x02;           // reset the counter
    LPC_TIM0->PR  = 24;             // 25 MHz / (24 + 1) = 1 MHz
    LPC_TIM0->TCR = 0x01;           // start
    while (LPC_TIM0->TC < us);
    LPC_TIM0->TCR = 0x00;           // stop
}

void uart3_init(void)
{
    LPC_SC->PCONP |= (1 << 25);
    LPC_PINCON->PINSEL0 &= ~0x0F;
    LPC_PINCON->PINSEL0 |=  0x0A;
    LPC_UART3->LCR = 0x83;
    LPC_UART3->DLM = 0x00;
    LPC_UART3->DLL = 0x13;
    LPC_UART3->LCR = 0x03;
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
