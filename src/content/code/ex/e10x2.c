// EINT2 + DC motor: each press of SW2 reverses the motor.
// CNA -> CNA5 (motor), CNB -> CNB1 (SW2)
#include <LPC17xx.h>

volatile unsigned int direction = 0;
volatile unsigned int changed = 1;
volatile unsigned long i;   // volatile: keeps delay loops at any optimisation level


// Peripheral clock read from the chip (PCLKSEL: 00 = CCLK/4, 01 = CCLK, 10 = CCLK/2, 11 = CCLK/8)
unsigned int pclk(unsigned int pclksel, unsigned int shift)
{
    unsigned int sel = (pclksel >> shift) & 3;
    return SystemCoreClock / (sel == 0 ? 4 : sel == 1 ? 1 : sel == 2 ? 2 : 8);
}

// A real switch bounces for a few milliseconds and would fire several interrupts per
// press. Timer 1 runs as a free millisecond clock; presses closer than 50 ms are ignored.
unsigned int last_press = 0xFFFF0000;

int debounced(void)
{
    unsigned int now = LPC_TIM1->TC;
    if (now - last_press < 50) return 0;
    last_press = now;
    return 1;
}

void eint2_init(void)
{
    LPC_TIM1->TCR = 0x02;                                    // millisecond clock for debouncing
    LPC_TIM1->PR  = pclk(LPC_SC->PCLKSEL0, 4) / 1000 - 1;
    LPC_TIM1->TCR = 0x01;
    LPC_PINCON->PINSEL4 &= ~(3 << 24);
    LPC_PINCON->PINSEL4 |=  (1 << 24);          // P2.12 = EINT2 (SW2)
    LPC_SC->EXTINT   = 1 << 2;
    LPC_SC->EXTMODE  = 1 << 2;                  // edge sensitive
    LPC_SC->EXTPOLAR = 0;                       // falling edge
    NVIC_EnableIRQ(EINT2_IRQn);
}

void EINT2_IRQHandler(void)
{
    LPC_SC->EXTINT = 1 << 2;                    // clear the interrupt first
    if (!debounced()) return;                   // a bounce of the same press: ignore it
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
