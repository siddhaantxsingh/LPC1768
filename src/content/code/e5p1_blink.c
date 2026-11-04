#include <LPC17xx.h>

unsigned int delay_cnt;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 = 0x00000000;   // P0.0 - P0.15 as GPIO
    LPC_GPIO0->FIODIR   = 0x00000FF0;   // P0.4 - P0.11 as outputs

    while (1)
    {
        LPC_GPIO0->FIOCLR = 0x00000FF0; // LEDs off
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);

        LPC_GPIO0->FIOSET = 0x00000FF0; // LEDs on
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
    }
}
