// 8-bit Johnson (twisted ring) counter on LD2-LD9
// 00000000 -> 00000001 -> 00000011 -> ... -> 11111111 -> 11111110 -> ... -> 00000000
#include <LPC17xx.h>

unsigned int i;

int main(void)
{
    unsigned int q = 0;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFF0000FF;
    LPC_GPIO0->FIODIR   |= 0x00000FF0;

    while (1)
    {
        LPC_GPIO0->FIOCLR = 0x00000FF0;
        LPC_GPIO0->FIOSET = q << 4;
        for (i = 0; i < 30000; i++);
        // shift left, feeding back the inverted MSB
        q = ((q << 1) | ((~q >> 7) & 1)) & 0xFF;
    }
}
