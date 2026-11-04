// Alphanumeric LCD routines (4-bit mode)
// D4-D7 : P0.23-P0.26   RS : P0.27   EN : P0.28   RW : GND
#include <LPC17xx.h>
#include "AN_LCD.h"

unsigned int delay_cnt;

// send the 4-bit value in the low nibble of p1data as DATA
void LCD_data1(unsigned char p1data)
{
    unsigned char i;
    i = (~p1data) & 0x0F;
    LPC_GPIO0->FIOCLR = (i << 23);
    LPC_GPIO0->FIOSET = (p1data << 23);
    LPC_GPIO0->FIOSET = 0x08000000;     // RS = 1
    LPC_GPIO0->FIOSET = 0x10000000;     // EN = 1
    for (delay_cnt = 0; delay_cnt < 1000; delay_cnt++);
    LPC_GPIO0->FIOCLR = 0x10000000;     // EN = 0
    for (delay_cnt = 0; delay_cnt < 1000; delay_cnt++);
}

// send the 4-bit value in the low nibble of p1data as a COMMAND
void LCD_cmd1(unsigned char p1data)
{
    unsigned char i;
    i = (~p1data) & 0x0F;
    LPC_GPIO0->FIOCLR = (i << 23);
    LPC_GPIO0->FIOSET = (p1data << 23);
    LPC_GPIO0->FIOCLR = 0x08000000;     // RS = 0
    LPC_GPIO0->FIOSET = 0x10000000;     // EN = 1
    for (delay_cnt = 0; delay_cnt < 1000; delay_cnt++);
    LPC_GPIO0->FIOCLR = 0x10000000;     // EN = 0
    for (delay_cnt = 0; delay_cnt < 1000; delay_cnt++);
}

void LCD_data(unsigned char p2data)
{
    LCD_data1(p2data >> 4);             // high nibble
    LCD_data1(p2data);                  // low nibble
}

void LCD_cmd(unsigned char p2data)
{
    LCD_cmd1(p2data >> 4);
    LCD_cmd1(p2data);
}

void delay_lcd(unsigned int r1)
{
    unsigned int r;
    for (r = 0; r < r1; r++);
}

void lcd_init(void)
{
    LPC_PINCON->PINSEL1 &= 0xFC003FFF;  // P0.23 - P0.28 as GPIO
    LPC_GPIO0->FIODIR   |= 0x1F800000;  // P0.23 - P0.28 as outputs

    LPC_GPIO0->FIOCLR = 0x08000000;     // RS = 0
    LPC_GPIO0->FIOCLR = 0x10000000;     // EN = 0
    delay_lcd(32000);

    // 4-bit initialisation sequence from the LCD datasheet
    LCD_cmd1(0x03);  delay_lcd(30000);
    LCD_cmd1(0x03);  delay_lcd(30000);
    LCD_cmd1(0x03);  delay_lcd(30000);
    LCD_cmd1(0x02);  delay_lcd(30000);
    LCD_cmd(0x28);   delay_lcd(30000);  // 4-bit, 2 lines, 5x7 font

    LCD_cmd(0x0C);   delay_lcd(30000);  // display ON, cursor OFF
    LCD_cmd(0x06);   delay_lcd(30000);  // auto-increment cursor
}

void LCD_puts(unsigned char *buf1)
{
    unsigned int i = 0;
    while (buf1[i] != '\0')
    {
        LCD_data(buf1[i]);
        i++;
        if (i == 16)
            LCD_cmd(0xC0);              // wrap to line 2
    }
}
