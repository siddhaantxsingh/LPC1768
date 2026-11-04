; Extract bits 8-15 of a 32-bit number
    AREA EX1_5, CODE, READONLY
    ENTRY
        LDR  R0, =0x12345678
        MOV  R1, R0, LSR #8     ; bring bits 8-15 down to 0-7
        AND  R1, R1, #0xFF      ; keep one byte  ->  R1 = 0x56
STOP    B    STOP
    END
