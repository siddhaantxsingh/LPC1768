#include <LPC17xx.h>
#include <stdio.h>
#include "AN_LCD.h"

#define Ref_Vtg     3.300
#define Full_Scale  0xFFF           // 12-bit ADC

int main(void)
{
    unsigned long adc_temp;
    unsigned int i;
    float in_vtg;
    unsigned char vtg[7], dval[7];
    unsigned char Msg3[11] = {"ANALOG IP:"};
    unsigned char Msg4[12] = {"ADC OUTPUT:"};

    SystemInit();
    SystemCoreClockUpdate();
    LPC_SC->PCONP |= (1 << 15);         // power for GPIO block
    lcd_init();
    LPC_PINCON->PINSEL3 |= 0x30000000;  // P1.30 as AD0.4
    LPC_SC->PCONP |= (1 << 12);         // enable the ADC peripheral

    LCD_cmd(0x80);
    delay_lcd(800);
    LCD_puts(Msg3);
    LCD_cmd(0xC0);
    delay_lcd(800);
    LCD_puts(Msg4);

    while (1)
    {
        LPC_ADC->ADCR = (1 << 4) | (1 << 21) | (1 << 24); // AD0.4, PDN, start now
        for (i = 0; i < 2000; i++);                         // conversion delay
        while ((adc_temp = LPC_ADC->ADGDR) == 0x80000000);  // wait for DONE
        adc_temp = LPC_ADC->ADGDR;
        adc_temp >>= 4;
        adc_temp &= 0x00000FFF;                             // 12-bit result

        in_vtg = (((float)adc_temp * (float)Ref_Vtg)) / ((float)Full_Scale);
        sprintf(vtg, "%3.2fV", in_vtg);
        sprintf(dval, "%x", adc_temp);

        for (i = 0; i < 2000; i++);
        LCD_cmd(0x8A);
        delay_lcd(800);
        LCD_puts(vtg);
        LCD_cmd(0xCB);
        delay_lcd(800);
        LCD_puts(dval);

        for (i = 0; i < 200000; i++);
        for (i = 0; i < 7; i++)
            vtg[i] = dval[i] = 0x00;
        adc_temp = 0;
        in_vtg = 0;
    }
}
