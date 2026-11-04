; X to the power N by repeated multiplication
    AREA EX2_6, CODE, READONLY
    ENTRY
        LDR  R0, =X
        LDR  R1, [R0]           ; R1 = X
        LDR  R2, [R0, #4]       ; R2 = N
        MOV  R3, #1             ; R3 = result
LOOP    CMP  R2, #0
        BEQ  DONE
        MUL  R4, R3, R1         ; result = result * X
        MOV  R3, R4
        SUB  R2, R2, #1
        B    LOOP
DONE    LDR  R0, =RESULT
        STR  R3, [R0]           ; 3^5 = 243 (0xF3)
STOP    B    STOP

    AREA DATA1, DATA, READWRITE
X       DCD 3
NPOW    DCD 5
RESULT  DCD 0
    END
