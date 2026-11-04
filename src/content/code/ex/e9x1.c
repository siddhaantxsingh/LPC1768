// Rotate the stepper motor 180 degrees anticlockwise, then stop.
// 1.8 deg per step -> 100 steps = 25 groups of 4 steps.
#include <LPC17xx.h>

unsigned int k;

void anti_clock_wise(void)
{
    unsigned long var1 = 0x00000100;
    unsigned int i;
    for (i = 0; i < 4; i++)
    {
        var1 = var1 >> 1;
        LPC_GPIO0->FIOPIN = ~var1;
        for (k = 0; k < 3000; k++);
    }
}

int main(void)
{
    unsigned int j;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFFFF00FF;
    LPC_GPIO0->FIODIR   |= 0x000000F0;

    for (j = 0; j < 25; j++)            // 25 x 4 = 100 steps = 180 degrees
        anti_clock_wise();

    LPC_GPIO0->FIOSET = 0x000000F0;     // all coils off
    while (1);
}
