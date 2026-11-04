// EINT2 sequences the motors:
// off -> stepper CW -> stepper ACW -> DC CW -> DC ACW -> off ...
// CNA -> CNA5 (stepper + DC motor), CNB -> CNB1 (SW2)
#include <LPC17xx.h>

volatile unsigned int state = 0;

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
    state = (state + 1) % 5;
    LPC_SC->EXTINT = 1 << 2;
}

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFFC300FF;          // P0.4 - P0.7, P0.9, P0.10 GPIO
    LPC_GPIO0->FIODIR   |= 0x000006F0;
    eint2_init();

    while (1)
    {
        switch (state)
        {
        case 0:                                 // everything off
            LPC_GPIO0->FIOSET = 0x000000F0;     // stepper coils off
            LPC_GPIO0->FIOCLR = 1 << 9;         // DC motor off
            break;
        case 1: LPC_GPIO0->FIOCLR = 1 << 9; step_cw();  break;
        case 2: LPC_GPIO0->FIOCLR = 1 << 9; step_acw(); break;
        case 3:
            LPC_GPIO0->FIOSET = 0x000000F0;
            LPC_GPIO0->FIOSET = (1 << 10) | (1 << 9);   // DC clockwise
            break;
        case 4:
            LPC_GPIO0->FIOSET = 0x000000F0;
            LPC_GPIO0->FIOCLR = 1 << 10;                // DC anticlockwise
            LPC_GPIO0->FIOSET = 1 << 9;
            break;
        }
    }
}
