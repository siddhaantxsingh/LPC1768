; Convert lowercase letters in a string to uppercase (in place)
    AREA EX3_4, CODE, READONLY
    ENTRY
        LDR   R0, =STR1
LOOP    LDRB  R1, [R0]
        CMP   R1, #0
        BEQ   STOP
        CMP   R1, #'a'
        BLO   NEXT              ; below 'a' - leave it
        CMP   R1, #'z'
        BHI   NEXT              ; above 'z' - leave it
        SUB   R1, R1, #32       ; 'a'-'A' = 32
        STRB  R1, [R0]
NEXT    ADD   R0, R0, #1
        B     LOOP
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
STR1    DCB "Embedded Systems Lab 2026", 0
    END
