// ADC (AD0.4 / POT4) shown in hexadecimal on the 7-segment display,
// re-sampled every 2 seconds. CNA -> CNA2, CNB -> CNB2.
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

unsigned char seg_code[16] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07,
                               0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71};

unsigned int read_adc(void)
{
    unsigned int v;
    LPC_ADC->ADCR = (1 << 4) | (4 << 8) | (1 << 21) | (1 << 24);   // AD0.4, start
    while (!((v = LPC_ADC->ADGDR) & 0x80000000));                  // wait for DONE
    return (v >> 4) & 0xFFF;
}

int main(void)
{
    unsigned int value = 0, digit, ms;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_SC->PCONP |= (1 << 12);                 // power the ADC
    LPC_PINCON->PINSEL3 |= (3 << 28);           // P1.30 = AD0.4
    LPC_PINCON->PINSEL0 &= 0xFF0000FF;
    LPC_PINCON->PINSEL3 &= 0xFFC03FFF;
    LPC_GPIO0->FIODIR |= 0x00000FF0;
    LPC_GPIO1->FIODIR |= 0x07800000;

    while (1)
    {
        value = read_adc();
        for (ms = 0; ms < 2000; ms += 3)        // refresh for 2 s
        {
            for (digit = 0; digit < 3; digit++) // three hex digits, rightmost first
            {
                LPC_GPIO0->FIOPIN = seg_code[(value >> (4 * digit)) & 0xF] << 4;
                LPC_GPIO1->FIOPIN = digit << 23;
                delay_us(1000);
            }
        }
    }
}
