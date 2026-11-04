// 1 kHz sine wave on the DAC: 3 V peak-to-peak centred on 1.65 V.
// 40 samples per cycle, one every 25 us.  Open JP5, watch TP8.
#include <LPC17xx.h>
#include <math.h>

#define SAMPLES 40

unsigned int table[SAMPLES];

int main(void)
{
    int k;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL1 &= ~(3 << 20);
    LPC_PINCON->PINSEL1 |=  (2 << 20);          // P0.26 = AOUT

    for (k = 0; k < SAMPLES; k++)               // build the lookup table once
    {
        float v = 1.65 + 1.5 * sin(2 * 3.14159265 * k / SAMPLES);
        table[k] = (unsigned int)(v / 3.3 * 1023);
    }

    // Timer 0 paces the samples: 1 us ticks, match every 25 us
    LPC_TIM0->PR  = 24;
    LPC_TIM0->MR0 = 25;
    LPC_TIM0->MCR = (1 << 0) | (1 << 1);        // flag + reset TC on MR0
    LPC_TIM0->TCR = 0x02;
    LPC_TIM0->TCR = 0x01;

    while (1)
    {
        for (k = 0; k < SAMPLES; k++)
        {
            LPC_DAC->DACR = table[k] << 6;
            while (!(LPC_TIM0->IR & 1));        // wait for the MR0 match flag
            LPC_TIM0->IR = 1;                   // clear it (write 1)
        }
    }
}
