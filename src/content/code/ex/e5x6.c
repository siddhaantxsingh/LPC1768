// External buzzer driven by the PWM1.4 hardware output on P1.23 (TP5).
// MR0 sets the period (pitch), MR4 the duty cycle. A short melody repeats.
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

void tone(unsigned int freq)
{
    unsigned int period = 1000000 / freq;       // PWM clock is 1 MHz
    LPC_PWM1->MR0 = period;
    LPC_PWM1->MR4 = period / 2;                 // 50% duty
    LPC_PWM1->LER = (1 << 0) | (1 << 4);        // latch the new values
}

int main(void)
{
    unsigned int melody[6] = {523, 659, 784, 1047, 784, 659};
    int k;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL3 &= ~(3 << 14);
    LPC_PINCON->PINSEL3 |=  (2 << 14);          // P1.23 = PWM1.4

    LPC_PWM1->PR  = pclk(LPC_SC->PCLKSEL0, 12) / 1000000 - 1;  // PWM clock = 1 MHz at any CCLK
    LPC_PWM1->MCR = (1 << 1);                   // reset on MR0
    LPC_PWM1->PCR = (1 << 12);                  // enable PWM1.4 output
    tone(523);
    LPC_PWM1->TCR = (1 << 0) | (1 << 3);        // counter + PWM enable

    while (1)
    {
        for (k = 0; k < 6; k++)
        {
            tone(melody[k]);
            delay_us(300000);
        }
    }
}
