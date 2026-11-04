// Receive characters from the PC on UART3 and show them on the LCD.
// Type in the Serial tab. CND -> CNAD.
#include <LPC17xx.h>
#include "AN_LCD.h"

// Peripheral clock of a timer/UART, read from the chip so all timing stays correct
// whatever clock the board actually runs at. PCLKSEL field: 00 = CCLK/4, 01 = CCLK,
// 10 = CCLK/2, 11 = CCLK/8. (SystemCoreClock is set by SystemCoreClockUpdate().)
unsigned int pclk(unsigned int pclksel, unsigned int shift)
{
    unsigned int sel = (pclksel >> shift) & 3;
    return SystemCoreClock / (sel == 0 ? 4 : sel == 1 ? 1 : sel == 2 ? 2 : 8);
}

void uart3_init(void)
{
    unsigned int divisor;
    LPC_SC->PCONP |= (1 << 25);
    LPC_PINCON->PINSEL0 &= ~0x0F;
    LPC_PINCON->PINSEL0 |=  0x0A;               // P0.0 TXD3, P0.1 RXD3
    divisor = pclk(LPC_SC->PCLKSEL1, 18) / (16 * 9600);   // 9600 baud at any clock
    LPC_UART3->LCR = 0x83;                      // DLAB = 1
    LPC_UART3->DLM = divisor >> 8;
    LPC_UART3->DLL = divisor & 0xFF;
    LPC_UART3->LCR = 0x03;                      // 8N1, DLAB = 0
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
