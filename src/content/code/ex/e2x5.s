; Factorial of N (keep N <= 12 to avoid 32-bit overflow)
    AREA EX2_5, CODE, READONLY
    ENTRY
        LDR  R0, =N
        LDR  R1, [R0]           ; R1 = N
        MOV  R2, #1             ; R2 = result
LOOP    CMP  R1, #1
        BLS  DONE               ; stop when N <= 1
        MUL  R3, R2, R1         ; R3 = result * N   (Rd must differ from Rm)
        MOV  R2, R3
        SUB  R1, R1, #1
        B    LOOP
DONE    LDR  R0, =RESULT
        STR  R2, [R0]           ; 6! = 720 (0x2D0)
STOP    B    STOP

    AREA DATA1, DATA, READWRITE
N       DCD 6
RESULT  DCD 0
    END
