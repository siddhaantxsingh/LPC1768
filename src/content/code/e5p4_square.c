#include <LPC17xx.h>

unsigned int delay_cnt = 0;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL3 = 0x00000000;   // P1.16 - P1.31 as GPIO
    LPC_GPIO1->FIODIR   = 0x00800000;   // P1.23 as output

    while (1)
    {
        LPC_GPIO1->FIOCLR = 0x00800000;
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);

        LPC_GPIO1->FIOSET = 0x00800000;
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
    }
}
