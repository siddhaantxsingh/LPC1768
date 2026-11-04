#include <LPC17xx.h>

#define FIRST_SEG   0xF87FFFFF
#define SECOND_SEG  0xF8FFFFFF
#define THIRD_SEG   0xF97FFFFF
#define FOURTH_SEG  0xF9FFFFFF
#define DISABLE_ALL 0xFA7FFFFF

unsigned int delay_cnt = 0;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 &= 0xFF0000FF;  // P0.4 - P0.11 GPIO (data lines)
    LPC_PINCON->PINSEL3 &= 0xFFC03FFF;  // P1.23 - P1.26 GPIO (enable lines)
    LPC_GPIO0->FIODIR   |= 0x00000FF0;  // P0.4 - P0.11 output
    LPC_GPIO1->FIODIR   |= 0x07800000;  // P1.23 - P1.26 output

    while (1)
    {
        LPC_GPIO0->FIOPIN = 0x00000760;  // 'H'
        LPC_GPIO1->FIOPIN = FOURTH_SEG;
        for (delay_cnt = 0; delay_cnt < 500; delay_cnt++);

        LPC_GPIO0->FIOPIN = 0x00000790;  // 'E'
        LPC_GPIO1->FIOPIN = THIRD_SEG;
        for (delay_cnt = 0; delay_cnt < 500; delay_cnt++);

        LPC_GPIO0->FIOPIN = 0x00000380;  // 'L'
        LPC_GPIO1->FIOPIN = SECOND_SEG;
        for (delay_cnt = 0; delay_cnt < 500; delay_cnt++);

        LPC_GPIO0->FIOPIN = 0x00000730;  // 'P'
        LPC_GPIO1->FIOPIN = FIRST_SEG;
        for (delay_cnt = 0; delay_cnt < 500; delay_cnt++);

        LPC_GPIO0->FIOCLR = 0x00000FF0;
        LPC_GPIO1->FIOPIN = DISABLE_ALL;
    }
}
