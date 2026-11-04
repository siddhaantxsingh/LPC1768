// EINT2 + stepper: each press of SW2 reverses the direction of rotation.
// CNA -> CNA5 (stepper), CNB -> CNB1 (SW2)
#include <LPC17xx.h>

volatile unsigned int direction = 0;            // 0 = clockwise, 1 = anticlockwise

unsigned int k;

// Drive one coil LOW (energised through the ULN2803), the other three HIGH.
// FIOSET/FIOCLR touch only P0.4-P0.7, so the DC-motor pins are left alone.
void coil(unsigned long v)
{
    LPC_GPIO0->FIOSET = 0xF0 & ~v;
    LPC_GPIO0->FIOCLR = v;
    for (k = 0; k < 3000; k++);
}

void step_cw(void)
{
    unsigned long v = 0x08;
    unsigned int i;
    for (i = 0; i < 4; i++) { v <<= 1; coil(v); }
}

void step_acw(void)
{
    unsigned long v = 0x100;
    unsigned int i;
    for (i = 0; i < 4; i++) { v >>= 1; coil(v); }
}

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
    LPC_SC->EXTINT = 1 << 2;                    // clear the interrupt
}

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFFFF00FF;
    LPC_GPIO0->FIODIR   |= 0x000000F0;
    eint2_init();

    while (1)
    {
        if (direction == 0) step_cw();
        else                step_acw();
    }
}
