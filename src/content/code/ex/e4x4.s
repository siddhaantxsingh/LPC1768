; Factorial using a recursive subroutine and the stack
    AREA EX4_4, CODE, READONLY
    ENTRY
        LDR   SP, =0x40008000   ; stack at the top of RAM (a Keil startup file normally does this)
        LDR   R1, =N
        LDR   R0, [R1]
        BL    FACT              ; R0 = N!
        LDR   R1, =RESULT
        STR   R0, [R1]          ; 7! = 5040 (0x13B0)
STOP    B     STOP

; R0 = n on entry, n! on exit
FACT    CMP   R0, #1
        MOVLS R0, #1            ; 0! = 1! = 1
        BXLS  LR
        STMFD SP!, {R4, LR}     ; save n's register and return address
        MOV   R4, R0
        SUB   R0, R0, #1
        BL    FACT              ; R0 = (n-1)!
        MUL   R1, R0, R4        ; n * (n-1)!
        MOV   R0, R1
        LDMFD SP!, {R4, PC}

    AREA DATA1, DATA, READWRITE
N       DCD 7
RESULT  DCD 0
    END
