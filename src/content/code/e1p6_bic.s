    AREA PROGRAM6, CODE, READONLY
    ENTRY
        LDR R0, =0xFFFFFFFF ; Load the input number
        LDR R1, =0x000000F0 ; Bit mask to clear bits 4-7
        BIC R2, R0, R1      ; R2 = R0 AND (NOT R1)
STOP    B STOP              ; Infinite loop
    END
