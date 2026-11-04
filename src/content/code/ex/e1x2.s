; Y = (A + B) x C
    AREA EX1_2, CODE, READONLY
    ENTRY
        MOV  R0, #6         ; A
        MOV  R1, #9         ; B
        MOV  R2, #4         ; C
        ADD  R3, R0, R1     ; R3 = A + B
        MUL  R4, R3, R2     ; R4 = (A + B) x C = 60 (0x3C)
STOP    B    STOP
    END
