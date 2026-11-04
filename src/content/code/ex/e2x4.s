; Sum of odd numbers 1 + 3 + ... up to N
    AREA EX2_4, CODE, READONLY
    ENTRY
        LDR  R0, =N
        LDR  R1, [R0]
        MOV  R2, #0             ; sum
        MOV  R3, #1             ; current odd number
LOOP    CMP  R3, R1
        BHI  DONE
        ADD  R2, R2, R3
        ADD  R3, R3, #2
        B    LOOP
DONE    LDR  R0, =RESULT
        STR  R2, [R0]           ; N = 10  ->  25
STOP    B    STOP

    AREA DATA1, DATA, READWRITE
N       DCD 10
RESULT  DCD 0
    END
