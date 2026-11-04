; Is a number divisible by 4?  RESULT = 1 if yes, 0 if no
    AREA EX2_1, CODE, READONLY
    ENTRY
        LDR   R0, =NUMBER
        LDR   R1, [R0]
        TST   R1, #3            ; look at the two least significant bits
        MOVEQ R2, #1            ; both zero  -> divisible
        MOVNE R2, #0
        LDR   R0, =RESULT
        STR   R2, [R0]
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
NUMBER  DCD 52
RESULT  DCD 0
    END
