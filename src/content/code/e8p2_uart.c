#include <LPC17xx.h>

void UART3_Init(void);
void UART3_IRQHandler(void);

unsigned char tx3_flag, rx3_flag;
unsigned char recv_data;

int main(void)
{
    SystemInit();
    SystemCoreClockUpdate();
    UART3_Init();

    while (1)
    {
        while (rx3_flag == 0x00);       // wait for a character
        rx3_flag = 0x00;
        LPC_UART3->THR = recv_data;     // echo it back
        while (tx3_flag == 0x00);
        tx3_flag = 0x00;
    }
}

void UART3_Init(void)
{
    LPC_SC->PCONP |= (1 << 25);         // UART3 peripheral enable
    LPC_PINCON->PINSEL0 &= ~0x0000000F;
    LPC_PINCON->PINSEL0 |=  0x0000000A; // P0.0 TXD3, P0.1 RXD3
    LPC_UART3->LCR = 0x00000083;        // DLAB=1, 8 bit, 1 stop, no parity
    LPC_UART3->DLM = 0x00;
    LPC_UART3->DLL = 0x13;              // 9600 bps
    LPC_UART3->LCR = 0x00000003;        // DLAB=0
    LPC_UART3->FCR = 0x07;
    LPC_UART3->IER = 0x03;              // transmit and receive interrupts

    NVIC_EnableIRQ(UART3_IRQn);
}

void UART3_IRQHandler(void)
{
    unsigned long Int_Stat;
    Int_Stat = LPC_UART3->IIR;          // interrupt identification
    Int_Stat = Int_Stat & 0x06;

    if ((Int_Stat & 0x02) == 0x02)      // transmit holding register empty
        tx3_flag = 0xFF;
    else if ((Int_Stat & 0x04) == 0x04) // receive data available
    {
        recv_data = LPC_UART3->RBR;
        rx3_flag = 0xFF;
    }
}
