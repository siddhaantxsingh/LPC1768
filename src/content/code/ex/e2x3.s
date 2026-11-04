; Sum of even numbers 2 + 4 + ... + N
    AREA EX2_3, CODE, READONLY
    ENTRY
        LDR  R0, =N
        LDR  R1, [R0]           ; R1 = N
        MOV  R2, #0             ; sum
        MOV  R3, #2             ; current even number
LOOP    CMP  R3, R1
        BHI  DONE               ; stop when R3 > N
        ADD  R2, R2, R3
        ADD  R3, R3, #2
        B    LOOP
DONE    LDR  R0, =RESULT
        STR  R2, [R0]           ; N = 10  ->  30
STOP    B    STOP

    AREA DATA1, DATA, READWRITE
N       DCD 10
RESULT  DCD 0
    END
