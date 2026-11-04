#include <LPC17xx.h>

#define DAC_BIAS    (0x1 << 16)     // max update rate 400 kHz
#define DATA_LENGTH 0x400           // 10-bit DAC: 0 .. 0x3FF

void DAC_Init(void);

int main(void)
{
    unsigned int m, i = 0;          // i starts at 0 (uninitialised in the listing)

    SystemInit();
    SystemCoreClockUpdate();
    DAC_Init();

    while (1)
    {
        LPC_DAC->DACR = (i << 6) | DAC_BIAS;
        // AOUT = VALUE x ((VREFP - VREFN) / 1024) + VREFN
        i++;
        for (m = 100; m > 1; m--);
        if (i == DATA_LENGTH)
            i = 0;
    }
}

void DAC_Init(void)
{
    // The DAC has no PCONP bit: selecting AOUT on P0.26 enables it.
    LPC_PINCON->PINSEL1 = 0x00200000;   // P0.26 as AOUT
    LPC_DAC->DACCNTVAL = 0x00FF;
    LPC_DAC->DACCTRL = (0x1 << 1) | (0x1 << 2);
}
