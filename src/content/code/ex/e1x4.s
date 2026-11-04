; Check whether bit n of a number is 0 or 1  (R3 = 1 if set, 0 if clear)
    AREA EX1_4, CODE, READONLY
    ENTRY
        LDR   R0, =0x00000A5C   ; number
        MOV   R1, #3            ; bit position to test
        MOV   R2, #1
        MOV   R2, R2, LSL R1    ; R2 = 1 << n  (mask)
        TST   R0, R2            ; Z = 1 if the bit is 0
        MOVEQ R3, #0
        MOVNE R3, #1            ; bit 3 of 0xA5C is 1  ->  R3 = 1
STOP    B     STOP
    END
