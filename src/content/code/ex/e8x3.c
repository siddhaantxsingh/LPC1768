// 4x4 key matrix -> key code (0-F) on the 7-segment display.
// The key matrix needs CNB, so the digit-select lines come from CNC:
// CNB -> CNB3 (keys), CNA -> CNA2 (segments), CNC -> CNB2 (digit select on P0.15-P0.18)
#include <LPC17xx.h>

unsigned char seg_code[16] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07,
                               0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71};

volatile unsigned int d;   // volatile: keeps delay loops at any optimisation level

int scan(void)
{
    unsigned int row, cols, c;
    for (row = 0; row < 4; row++)
    {
        LPC_GPIO2->FIOCLR = 0x3C00;
        LPC_GPIO2->FIOSET = 1 << (10 + row);
        for (d = 0; d < 20; d++);               // let the lines settle
        cols = (LPC_GPIO1->FIOPIN >> 23) & 0x0F;
        for (c = 0; c < 4; c++)
            if (cols & (1 << c)) return row * 4 + c;
    }
    return -1;
}

int main(void)
{
    int key;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_PINCON->PINSEL0 &= 0x3F0000FF;          // P0.4 - P0.11 and P0.15 GPIO
    LPC_PINCON->PINSEL1 &= ~0x3F;               // P0.16 - P0.18 GPIO
    LPC_GPIO0->FIODIR |= 0x00078FF0;            // segments + digit select
    LPC_GPIO2->FIODIR |= 0x3C00;                // rows
    LPC_GPIO0->FIOCLR  = 0x00078000;            // select digit 0 (rightmost)
    LPC_GPIO0->FIOCLR  = 0x00000FF0;

    while (1)
    {
        key = scan();
        if (key >= 0)
        {
            LPC_GPIO0->FIOCLR = 0x00000FF0;
            LPC_GPIO0->FIOSET = seg_code[key] << 4;
        }
    }
}
