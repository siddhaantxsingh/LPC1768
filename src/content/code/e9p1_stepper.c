#include <LPC17xx.h>

void clock_wise(void);
void anti_clock_wise(void);

unsigned long int var1;
unsigned int i = 0, j = 0, k = 0;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 = 0xFFFF00FF;   // P0.4 - P0.7 GPIO
    LPC_GPIO0->FIODIR   = 0x000000F0;   // P0.4 - P0.7 output

    while (1)
    {
        for (j = 0; j < 50; j++)        // clockwise rotation
            clock_wise();
        for (k = 0; k < 65000; k++);    // pause

        for (j = 0; j < 50; j++)        // anticlockwise rotation
            anti_clock_wise();
        for (k = 0; k < 65000; k++);
    }
}

void clock_wise(void)
{
    var1 = 0x00000008;                  // for clockwise
    for (i = 0; i <= 3; i++)            // A B C D stepping
    {
        var1 = var1 << 1;
        LPC_GPIO0->FIOPIN = ~var1;
        for (k = 0; k < 3000; k++);     // step speed
    }
}

void anti_clock_wise(void)
{
    var1 = 0x00000100;                  // for anticlockwise
    for (i = 0; i <= 3; i++)
    {
        var1 = var1 >> 1;
        LPC_GPIO0->FIOPIN = ~var1;
        for (k = 0; k < 3000; k++);
    }
}
