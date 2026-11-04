; Y = A + B - C
    AREA EX1_1, CODE, READONLY
    ENTRY
        MOV  R0, #45        ; A
        MOV  R1, #30        ; B
        MOV  R2, #15        ; C
        ADD  R3, R0, R1     ; R3 = A + B
        SUB  R3, R3, R2     ; R3 = A + B - C  = 60 (0x3C)
STOP    B    STOP
    END
