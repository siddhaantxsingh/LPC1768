// Ring counter on LD2-LD9: one LED "walks" across the bank
#include <LPC17xx.h>

unsigned int i;

int main(void)
{
    unsigned int pattern = 0x01;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFF0000FF;      // P0.4 - P0.11 GPIO
    LPC_GPIO0->FIODIR   |= 0x00000FF0;

    while (1)
    {
        LPC_GPIO0->FIOCLR = 0x00000FF0;
        LPC_GPIO0->FIOSET = pattern << 4;
        for (i = 0; i < 30000; i++);
        pattern <<= 1;
        if (pattern == 0x100)               // past LD9: wrap to LD2
            pattern = 0x01;
    }
}
