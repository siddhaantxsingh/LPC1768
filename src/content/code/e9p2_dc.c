#include <LPC17xx.h>

void Clock_Wise(void);
void AClock_Wise(void);

unsigned long i;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 &= 0xFFC3FFFF;  // P0.9 (on/off), P0.10 (direction) GPIO
    LPC_GPIO0->FIODIR   |= 0x00000600;  // P0.9 and P0.10 output

    while (1)
    {
        Clock_Wise();
        for (i = 0; i < 200000; i++);
        AClock_Wise();
        for (i = 0; i < 200000; i++);
    }
}

void Clock_Wise(void)
{
    LPC_GPIO0->FIOCLR = 0x00000200;     // P0.9 low: motor off
    for (i = 0; i < 10000; i++);        // let it coast (inertia)
    LPC_GPIO0->FIOSET = 0x00000600;     // direction + motor on
}

void AClock_Wise(void)
{
    LPC_GPIO0->FIOCLR = 0x00000200;     // motor off
    for (i = 0; i < 10000; i++);
    LPC_GPIO0->FIOCLR = 0x00000400;     // reverse direction
    LPC_GPIO0->FIOSET = 0x00000200;     // motor on
}
