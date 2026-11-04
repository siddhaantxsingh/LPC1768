// 2x4 key matrix + LCD: a different message for each of the 8 keys.
// CNB -> CNB3 (keys), CND -> CNAD (LCD)
#include <LPC17xx.h>
#include "AN_LCD.h"

unsigned char *msgs[8] = {
    (unsigned char *)"KEY 0: HELLO    ", (unsigned char *)"KEY 1: ECE DEPT ",
    (unsigned char *)"KEY 2: MIT      ", (unsigned char *)"KEY 3: MANIPAL  ",
    (unsigned char *)"KEY 4: LPC1768  ", (unsigned char *)"KEY 5: CORTEX-M3",
    (unsigned char *)"KEY 6: MES LAB  ", (unsigned char *)"KEY 7: GOODBYE  "
};

int scan(void)          // returns 0-7, or -1 if nothing is pressed
{
    unsigned int row, cols, c;
    for (row = 0; row < 2; row++)
    {
        LPC_GPIO2->FIOCLR = 0x3C00;
        LPC_GPIO2->FIOSET = 1 << (10 + row);
        cols = (LPC_GPIO1->FIOPIN >> 23) & 0x0F;
        for (c = 0; c < 4; c++)
            if (cols & (1 << c)) return row * 4 + c;
    }
    return -1;
}

int main(void)
{
    int key, last = -2;

    SystemInit();
    SystemCoreClockUpdate();
    LPC_GPIO2->FIODIR |= 0x3C00;
    lcd_init();
    LCD_cmd(0x01);
    LCD_cmd(0x80);
    LCD_puts((unsigned char *)"PRESS A KEY 0-7");

    while (1)
    {
        key = scan();
        if (key >= 0 && key != last)
        {
            LCD_cmd(0xC0);
            LCD_puts(msgs[key]);
        }
        last = key;
    }
}
