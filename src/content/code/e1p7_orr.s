    AREA PROGRAM7, CODE, READONLY
    ENTRY
        LDR R0, =0x12345600 ; 32-bit input number
        LDR R1, =0x0000000F ; Bit mask to set bits 0-3
        ORR R2, R0, R1      ; R2 = R0 OR R1
STOP    B STOP              ; Infinite loop
    END
