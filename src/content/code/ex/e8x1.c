// 1x4 key matrix + buzzer: each key plays its own tone while held.
// CNB -> CNB3 (keys), CNA -> CNA5 (buzzer on P0.11)
#include <LPC17xx.h>

// Microsecond delay using Timer 0 (PCLK = 25 MHz -> prescale 25 gives 1 us ticks)
void delay_us(unsigned int us)
{
    LPC_TIM0->TCR = 0x02;           // reset the counter
    LPC_TIM0->PR  = 24;             // 25 MHz / (24 + 1) = 1 MHz
    LPC_TIM0->TCR = 0x01;           // start
    while (LPC_TIM0->TC < us);
    LPC_TIM0->TCR = 0x00;           // stop
}

int main(void)
{
    unsigned int freq[4] = {262, 330, 392, 523};    // C4 E4 G4 C5
    unsigned int keys, k, half;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= ~(3 << 22);
    LPC_GPIO0->FIODIR   |= 1 << 11;             // buzzer
    LPC_GPIO2->FIODIR   |= 0x3C00;              // rows P2.10 - P2.13 output
    LPC_GPIO2->FIOCLR    = 0x3C00;
    LPC_GPIO2->FIOSET    = 1 << 10;             // drive row 1 HIGH

    while (1)
    {
        keys = (LPC_GPIO1->FIOPIN >> 23) & 0x0F;   // columns on P1.23 - P1.26
        for (k = 0; k < 4; k++)
            if (keys & (1 << k)) break;
        if (k < 4)
        {
            half = 500000 / freq[k];
            LPC_GPIO0->FIOSET = 1 << 11;
            delay_us(half);
            LPC_GPIO0->FIOCLR = 1 << 11;
            delay_us(half);
        }
    }
}
