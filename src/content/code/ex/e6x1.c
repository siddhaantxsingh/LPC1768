// Flash "ECE" on the 7-segment display: show it, blank it, repeat.
#include <LPC17xx.h>

volatile unsigned int d;   // volatile: keeps delay loops at any optimisation level

void show(unsigned int code, unsigned int digit)    // digit 0 = rightmost
{
    LPC_GPIO0->FIOPIN = code << 4;                  // segments a-h on P0.4-P0.11
    LPC_GPIO1->FIOPIN = digit << 23;                // digit select on P1.23-P1.26
    for (d = 0; d < 500; d++);
}

int main(void)
{
    unsigned int t;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFF0000FF;
    LPC_PINCON->PINSEL3 &= 0xFFC03FFF;
    LPC_GPIO0->FIODIR   |= 0x00000FF0;
    LPC_GPIO1->FIODIR   |= 0x07800000;

    while (1)
    {
        for (t = 0; t < 60; t++)            // ON for a while (multiplexed)
        {
            show(0x79, 2);                  // E
            show(0x39, 1);                  // C
            show(0x79, 0);                  // E
        }
        LPC_GPIO1->FIOPIN = 4 << 23;        // select code 4: all digits off
        for (d = 0; d < 60000; d++);        // OFF for a while
    }
}
