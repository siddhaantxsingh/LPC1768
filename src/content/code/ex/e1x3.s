; Toggle selected bits with EOR (here bits 0-7)
    AREA EX1_3, CODE, READONLY
    ENTRY
        LDR  R0, =0x12345678    ; input number
        LDR  R1, =0x000000FF    ; mask: bits to toggle
        EOR  R2, R0, R1         ; R2 = 0x12345687
STOP    B    STOP
    END
