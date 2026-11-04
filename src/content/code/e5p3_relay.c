#include <LPC17xx.h>

int main(void)
{
    unsigned int i;

    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 &= 0xFFFCFFFF;  // P0.8 as GPIO
    LPC_GPIO0->FIODIR   |= 0x00000100;  // P0.8 as output

    while (1)
    {
        LPC_GPIO0->FIOSET = 0x00000100; // relay ON
        for (i = 0; i < 40000; i++);
        LPC_GPIO0->FIOCLR = 0x00000100; // relay OFF
        for (i = 0; i < 40000; i++);
    }
}
