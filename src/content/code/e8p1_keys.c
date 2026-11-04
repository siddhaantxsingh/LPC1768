#include <LPC17xx.h>

unsigned int delay_cnt = 0;

int main(void)
{
    unsigned int keyin;
    unsigned char z, j;
    unsigned up_count[]   = {0x00, 0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90};
    unsigned down_count[] = {0x90, 0x80, 0x70, 0x60, 0x50, 0x40, 0x30, 0x20, 0x10, 0x00};

    SystemInit();
    SystemCoreClockUpdate();

    LPC_PINCON->PINSEL0 = 0x00000000;
    LPC_GPIO2->FIODIR = 0x3C00;         // rows P2.10 - P2.13 output
    LPC_GPIO0->FIODIR = 0xFF0;          // LEDs P0.4 - P0.11 output
    LPC_GPIO2->FIOSET = 0x0400;         // row 1 HIGH
    LPC_GPIO0->FIOCLR = 0xFF0;

    while (1)
    {
        keyin = LPC_GPIO1->FIOPIN;      // columns on P1.23 - P1.26

        if (keyin & 0x00800000)         // K1: right-shift ring counter
        {
            z = 0x80;
            for (j = 0; j < 4; j++)
            {
                LPC_GPIO0->FIOCLR = 0xFFF;
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                LPC_GPIO0->FIOSET = z;
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                z = z >> 1;
            }
        }
        else
            LPC_GPIO0->FIOCLR = 0x10;

        if (keyin & 0x01000000)         // K2: left-shift ring counter
        {
            z = 0x10;
            for (j = 0; j < 4; j++)
            {
                LPC_GPIO0->FIOCLR = 0xFFF;
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                LPC_GPIO0->FIOSET = z;
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                z = z << 1;
            }
        }
        else
            LPC_GPIO0->FIOCLR = 0x20;

        if (keyin & 0x02000000)         // K3: BCD down counter
        {
            for (j = 0; j < 10; j++)
            {
                LPC_GPIO0->FIOSET = down_count[j];
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                LPC_GPIO0->FIOCLR = down_count[j];
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
            }
        }
        else
            LPC_GPIO0->FIOCLR = 0x40;

        if (keyin & 0x04000000)         // K4: BCD up counter
        {
            for (j = 0; j < 10; j++)
            {
                LPC_GPIO0->FIOSET = up_count[j];
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                LPC_GPIO0->FIOCLR = up_count[j];
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
                for (delay_cnt = 0; delay_cnt < 10000; delay_cnt++);
            }
        }
        else
            LPC_GPIO0->FIOCLR = 0x80;
    }
}
