// External buzzer driven by the PWM1.4 hardware output on P1.23 (TP5).
// MR0 sets the period (pitch), MR4 the duty cycle. A short melody repeats.
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

    LPC_PWM1->PR  = 24;                         // 25 MHz / 25 = 1 MHz
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
