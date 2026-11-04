#include <LPC17xx.h>

void EINT2_IRQHandler(void);

unsigned char int2_flag = 0;

int main(void)
{
    unsigned char flag = 0;

    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL4 &= ~0x03000000;
    LPC_PINCON->PINSEL4  =  0x01000000; // P2.12 as EINT2
    LPC_PINCON->PINSEL3 &= 0xFFFF3FFF;  // P1.23 GPIO for LED
    LPC_GPIO1->FIODIR    = 0x00800000;  // P1.23 output
    LPC_GPIO1->FIOSET    = 0x00800000;  // LED initially ON

    LPC_SC->EXTINT   = 0x00000004;      // writing 1 clears the flag
    LPC_SC->EXTMODE  = 0x00000004;      // EINT2 edge sensitive
    LPC_SC->EXTPOLAR = 0x00000000;      // falling edge
    NVIC_EnableIRQ(EINT2_IRQn);

    while (1)
    {
        while (int2_flag == 0x00);      // wait for the interrupt
        int2_flag = 0x00;
        if (flag == 0x00)
        {
            LPC_GPIO1->FIOCLR = 0x00800000; // LED off
            flag = 0xFF;
        }
        else
        {
            LPC_GPIO1->FIOSET = 0x00800000; // LED on
            flag = 0x00;
        }
    }
}

void EINT2_IRQHandler(void)
{
    int2_flag = 0xFF;
    LPC_SC->EXTINT = 0x00000004;        // clear the interrupt
}
