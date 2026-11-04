// 2 kHz square wave, 75% duty, on the DAC output (P0.26 / TP8).
// Period 500 us: HIGH 375 us, LOW 125 us.  Open JP5.
#include <LPC17xx.h>

// Microsecond delay using Timer 0 (PCLK = 25 MHz -> prescale 25 gives 1 us ticks)
void delay_us(unsigned int us)
{
    LPC_TIM0->TCR = 0x02;           // reset the counter
    LPC_TIM0->PR  = 24;             // 25 MHz / (24 + 1) = 1 MHz
    LPC_TIM0->TCR = 0x01;           // start
    while (LPC_TIM0->TC < us);
    LPC_TIM0->TCR = 0x00;           // stop
}

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL1 &= ~(3 << 20);
    LPC_PINCON->PINSEL1 |=  (2 << 20);          // P0.26 = AOUT

    while (1)
    {
        LPC_DAC->DACR = 1023 << 6;              // 3.3 V
        delay_us(375);
        LPC_DAC->DACR = 0;                      // 0 V
        delay_us(125);
    }
}
