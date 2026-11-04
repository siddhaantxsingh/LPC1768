// EINT2 steps the DC motor through: off -> low -> medium -> high -> off ...
// CNA -> CNA5 (motor), CNB -> CNB1 (SW2)
#include <LPC17xx.h>

volatile unsigned int mode = 0;                 // 0 off, 1 low, 2 medium, 3 high
unsigned int duty_of[4] = {0, 30, 60, 100};
unsigned int d;

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
    mode = (mode + 1) % 4;
    LPC_SC->EXTINT = 1 << 2;
}

int main(void)
{
    unsigned int t;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFFC3FFFF;
    LPC_GPIO0->FIODIR   |= 0x00000600;
    LPC_GPIO0->FIOSET    = 1 << 10;             // clockwise
    eint2_init();

    while (1)                                   // software PWM on P0.9
    {
        for (t = 0; t < 100; t++)
        {
            if (t < duty_of[mode]) LPC_GPIO0->FIOSET = 1 << 9;
            else                   LPC_GPIO0->FIOCLR = 1 << 9;
            for (d = 0; d < 20; d++);
        }
    }
}
