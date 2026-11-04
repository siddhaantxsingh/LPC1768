; Count positive, negative and zero values in a signed array
    AREA EX3_2, CODE, READONLY
    ENTRY
        LDR   R0, =ARRAY
        MOV   R1, #8
        MOV   R2, #0            ; positive
        MOV   R3, #0            ; negative
        MOV   R4, #0            ; zero
LOOP    LDR   R5, [R0], #4
        CMP   R5, #0
        ADDGT R2, R2, #1
        ADDLT R3, R3, #1
        ADDEQ R4, R4, #1
        SUBS  R1, R1, #1
        BNE   LOOP
        LDR   R0, =POS
        STR   R2, [R0]          ; 3
        STR   R3, [R0, #4]      ; 3
        STR   R4, [R0, #8]      ; 2
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
ARRAY   DCD 5, -3, 0, 17, -42, 0, 8, -1
POS     DCD 0
NEG     DCD 0
ZERO    DCD 0
    END
