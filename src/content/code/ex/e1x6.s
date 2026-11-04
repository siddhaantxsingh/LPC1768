; Divide a signed number by 2 using an arithmetic shift right
    AREA EX1_6, CODE, READONLY
    ENTRY
        MVN  R0, #99            ; R0 = -100 (NOT 99)
        MOV  R1, R0, ASR #1     ; R1 = -50 (0xFFFFFFCE): sign bit preserved
        MOV  R2, R0, LSR #1     ; compare: a logical shift gives 0x7FFFFFCE
STOP    B    STOP
    END
