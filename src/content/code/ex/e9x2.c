// DC motor speed control by software PWM on P0.9 (enable).
// Low (30%) -> medium (60%) -> high (100%) -> repeat, about 2 s each.
#include <LPC17xx.h>

unsigned int d;

void run_at(unsigned int duty, unsigned int periods)   // duty in percent
{
    unsigned int p, t;
    for (p = 0; p < periods; p++)
    {
        for (t = 0; t < 100; t++)
        {
            if (t < duty) LPC_GPIO0->FIOSET = 1 << 9;
            else          LPC_GPIO0->FIOCLR = 1 << 9;
            for (d = 0; d < 20; d++);
        }
    }
}

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0xFFC3FFFF;          // P0.9, P0.10 GPIO
    LPC_GPIO0->FIODIR   |= 0x00000600;
    LPC_GPIO0->FIOSET    = 1 << 10;             // clockwise

    while (1)
    {
        run_at(30, 200);                        // low
        run_at(60, 200);                        // medium
        run_at(100, 200);                       // high
    }
}
