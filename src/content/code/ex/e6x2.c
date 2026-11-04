// Scroll "ECE,MIT" across the LCD using the display-shift command (0x18 / 0x1C)
#include <LPC17xx.h>
#include "AN_LCD.h"

int main(void)
{
    unsigned char msg[] = "ECE,MIT";
    int k;

    SystemInit();
    SystemCoreClockUpdate();
    lcd_init();
    LCD_cmd(0x01);
    LCD_cmd(0x80);
    LCD_puts(msg);

    while (1)
    {
        for (k = 0; k < 9; k++)             // move right across the line
        {
            LCD_cmd(0x1C);                  // shift display right
            delay_lcd(150000);
        }
        for (k = 0; k < 9; k++)             // and back
        {
            LCD_cmd(0x18);                  // shift display left
            delay_lcd(150000);
        }
    }
}
