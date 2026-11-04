; Largest of three numbers
    AREA EX2_2, CODE, READONLY
    ENTRY
        LDR   R0, =NUMS
        LDR   R1, [R0]          ; R1 = first
        LDR   R2, [R0, #4]      ; R2 = second
        LDR   R3, [R0, #8]      ; R3 = third
        CMP   R2, R1
        MOVHI R1, R2            ; R1 = max(first, second)
        CMP   R3, R1
        MOVHI R1, R3            ; R1 = max(R1, third)
        LDR   R0, =LARGEST
        STR   R1, [R0]
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
NUMS    DCD 37, 92, 58
LARGEST DCD 0
    END
