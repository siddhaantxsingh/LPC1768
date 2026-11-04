// 4-bit hex counter (0 - F) on LD2-LD5
#include <LPC17xx.h>

unsigned int i;

int main(void)
{
    unsigned int count = 0;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFF0000FF;
    LPC_GPIO0->FIODIR   |= 0x00000FF0;

    while (1)
    {
        LPC_GPIO0->FIOCLR = 0x00000FF0;
        LPC_GPIO0->FIOSET = (count & 0x0F) << 4;
        for (i = 0; i < 40000; i++);
        count = (count + 1) & 0x0F;
    }
}
