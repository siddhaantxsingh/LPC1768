// 2 kHz square wave, 75% duty, on the DAC output (P0.26 / TP8).
// Period 500 us: HIGH 375 us, LOW 125 us.  Open JP5.
#include <LPC17xx.h>

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
