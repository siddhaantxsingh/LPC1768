// Receive characters from the PC on UART3 and show them on the LCD.
// Type in the Serial tab. CND -> CNAD.
#include <LPC17xx.h>
#include "AN_LCD.h"

void uart3_init(void)
{
    LPC_SC->PCONP |= (1 << 25);
    LPC_PINCON->PINSEL0 &= ~0x0F;
    LPC_PINCON->PINSEL0 |=  0x0A;               // P0.0 TXD3, P0.1 RXD3
    LPC_UART3->LCR = 0x83;
    LPC_UART3->DLM = 0x00;
    LPC_UART3->DLL = 0x13;
    LPC_UART3->LCR = 0x03;
    LPC_UART3->FCR = 0x07;
}

int main(void)
{
    unsigned char ch;
    unsigned int col = 0;

    SystemInit();
    SystemCoreClockUpdate();
    uart3_init();
    lcd_init();
    LCD_cmd(0x01);
    LCD_cmd(0x80);

    while (1)
    {
        while (!(LPC_UART3->LSR & 0x01));       // wait for a character
        ch = LPC_UART3->RBR;
        if (ch == '\r' || ch == '\n') continue;
        if (col == 16) LCD_cmd(0xC0);           // wrap to line 2
        if (col == 32) { LCD_cmd(0x01); LCD_cmd(0x80); col = 0; }
        LCD_data(ch);
        col++;
        LPC_UART3->THR = ch;                    // echo back to the PC
    }
}
