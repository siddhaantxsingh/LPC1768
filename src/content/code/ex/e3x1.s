; Count even and odd values in an array
    AREA EX3_1, CODE, READONLY
    ENTRY
        LDR   R0, =ARRAY
        MOV   R1, #8            ; number of elements
        MOV   R2, #0            ; even count
        MOV   R3, #0            ; odd count
LOOP    LDR   R4, [R0], #4
        TST   R4, #1
        ADDEQ R2, R2, #1
        ADDNE R3, R3, #1
        SUBS  R1, R1, #1
        BNE   LOOP
        LDR   R0, =EVENS
        STR   R2, [R0]          ; 4 even
        STR   R3, [R0, #4]      ; 4 odd
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
ARRAY   DCD 12, 7, 33, 40, 18, 5, 21, 64
EVENS   DCD 0
ODDS    DCD 0
    END
