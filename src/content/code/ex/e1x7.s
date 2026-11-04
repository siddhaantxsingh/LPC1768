; Exchange the two bytes of a 16-bit number (0x1234 -> 0x3412)
    AREA EX1_7, CODE, READONLY
    ENTRY
        LDR  R0, =0x1234
        AND  R1, R0, #0xFF      ; R1 = low byte  (0x34)
        MOV  R2, R0, LSR #8     ; R2 = high byte (0x12)
        AND  R2, R2, #0xFF
        ORR  R3, R2, R1, LSL #8 ; R3 = 0x3412
STOP    B    STOP
    END
