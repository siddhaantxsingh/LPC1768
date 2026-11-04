; Sort an array in ascending order (bubble sort)
    AREA EX3_6, CODE, READONLY
    ENTRY
        MOV   R5, #6            ; number of elements
OUTER   SUBS  R5, R5, #1        ; passes left
        BEQ   STOP
        LDR   R0, =ARRAY
        MOV   R6, R5            ; compares in this pass
INNER   LDR   R1, [R0]
        LDR   R2, [R0, #4]
        CMP   R1, R2
        STRGT R2, [R0]          ; swap if out of order (signed)
        STRGT R1, [R0, #4]
        ADD   R0, R0, #4
        SUBS  R6, R6, #1
        BNE   INNER
        B     OUTER
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
ARRAY   DCD 44, -7, 19, 3, 88, 0    ; becomes -7, 0, 3, 19, 44, 88
    END
