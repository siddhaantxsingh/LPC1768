// 75% duty-cycle square wave on P1.23 (observe on TP5)
// HIGH for 3 delay units, LOW for 1 unit.
#include <LPC17xx.h>

volatile unsigned int d;   // volatile: keeps delay loops at any optimisation level

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL3 &= ~(3 << 14);          // P1.23 GPIO
    LPC_GPIO1->FIODIR   |= 1 << 23;

    while (1)
    {
        LPC_GPIO1->FIOSET = 1 << 23;
        for (d = 0; d < 3000; d++);             // 3 units HIGH
        LPC_GPIO1->FIOCLR = 1 << 23;
        for (d = 0; d < 1000; d++);             // 1 unit LOW
    }
}
