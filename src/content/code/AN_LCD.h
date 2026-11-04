#ifndef AN_LCD_H
#define AN_LCD_H

void LCD_data1(unsigned char p1data);
void LCD_cmd1(unsigned char p1data);
void LCD_data(unsigned char p2data);
void LCD_cmd(unsigned char p2data);
void delay_lcd(unsigned int r1);
void lcd_init(void);
void LCD_puts(unsigned char *buf1);

#endif
