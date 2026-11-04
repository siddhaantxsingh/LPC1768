#include <LPC17xx.h>

unsigned int delay_cnt;   // missing from the printed listing

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 &= 0xFF3FFFFF;  // P0.11 as GPIO
    LPC_GPIO0->FIODIR   |= 0x00000800;  // P0.11 as output

    while (1)
    {
        LPC_GPIO0->FIOSET = 0x00000800; // buzzer ON
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);

        LPC_GPIO0->FIOCLR = 0x00000800; // buzzer OFF
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
        for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
    }
}
