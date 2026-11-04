// EINT2 + DC motor: each press of SW2 reverses the motor.
// CNA -> CNA5 (motor), CNB -> CNB1 (SW2)
#include <LPC17xx.h>

volatile unsigned int direction = 0;
volatile unsigned int changed = 1;
unsigned long i;

void eint2_init(void)
{
    LPC_PINCON->PINSEL4 &= ~(3 << 24);
    LPC_PINCON->PINSEL4 |=  (1 << 24);          // P2.12 = EINT2 (SW2)
    LPC_SC->EXTINT   = 1 << 2;
    LPC_SC->EXTMODE  = 1 << 2;                  // edge sensitive
    LPC_SC->EXTPOLAR = 0;                       // falling edge
    NVIC_EnableIRQ(EINT2_IRQn);
}

void EINT2_IRQHandler(void)
{
    direction ^= 1;
    changed = 1;
    LPC_SC->EXTINT = 1 << 2;
}

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFFC3FFFF;
    LPC_GPIO0->FIODIR   |= 0x00000600;
    eint2_init();

    while (1)
    {
        if (changed)
        {
            changed = 0;
            LPC_GPIO0->FIOCLR = 1 << 9;         // stop first (inertia)
            for (i = 0; i < 10000; i++);
            if (direction == 0) LPC_GPIO0->FIOSET = 1 << 10;
            else                LPC_GPIO0->FIOCLR = 1 << 10;
            LPC_GPIO0->FIOSET = 1 << 9;         // run
        }
    }
}
