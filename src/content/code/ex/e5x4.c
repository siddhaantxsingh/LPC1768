// Musical tones on the buzzer (P0.11): plays the C-major scale up and down.
// The pin is toggled at the note frequency; Timer 0 gives exact half-periods.
#include <LPC17xx.h>

// Peripheral clock of a timer/UART, read from the chip so all timing stays correct
// whatever clock the board actually runs at. PCLKSEL field: 00 = CCLK/4, 01 = CCLK,
// 10 = CCLK/2, 11 = CCLK/8. (SystemCoreClock is set by SystemCoreClockUpdate().)
unsigned int pclk(unsigned int pclksel, unsigned int shift)
{
    unsigned int sel = (pclksel >> shift) & 3;
    return SystemCoreClock / (sel == 0 ? 4 : sel == 1 ? 1 : sel == 2 ? 2 : 8);
}

// Microsecond delay using Timer 0: the prescaler is computed from the real clock
void delay_us(unsigned int us)
{
    LPC_TIM0->TCR = 0x02;                                   // reset the counter
    LPC_TIM0->PR  = pclk(LPC_SC->PCLKSEL0, 2) / 1000000 - 1; // 1 tick = 1 us
    LPC_TIM0->TCR = 0x01;                                   // start
    while (LPC_TIM0->TC < us);
    LPC_TIM0->TCR = 0x00;                                   // stop
}

void play(unsigned int freq, unsigned int ms)
{
    unsigned int half = 500000 / freq;          // half period in us
    unsigned int cycles = (freq * ms) / 1000;
    unsigned int n;
    for (n = 0; n < cycles; n++)
    {
        LPC_GPIO0->FIOSET = 1 << 11;
        delay_us(half);
        LPC_GPIO0->FIOCLR = 1 << 11;
        delay_us(half);
    }
}

int main(void)
{
    //                      C4   D4   E4   F4   G4   A4   B4   C5
    unsigned int notes[8] = {262, 294, 330, 349, 392, 440, 494, 523};
    int k;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= ~(3 << 22);          // P0.11 GPIO
    LPC_GPIO0->FIODIR   |= 1 << 11;

    while (1)
    {
        for (k = 0; k < 8; k++)  play(notes[k], 250);
        for (k = 6; k >= 0; k--) play(notes[k], 250);
        delay_us(400000);
    }
}
