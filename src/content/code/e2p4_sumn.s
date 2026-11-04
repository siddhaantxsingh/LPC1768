    AREA PROGRAM4, CODE, READONLY
    ENTRY
        LDR  R0, =N         ; Load address of N
        LDR  R1, [R0]       ; R1 = N
        MOV  R2, #0         ; Initialise sum register R2 = 0

LOOP    ADD  R2, R2, R1     ; Sum = Sum + N
        SUBS R1, R1, #1     ; N = N - 1, update flags
        BNE  LOOP           ; Repeat until N = 0

        LDR  R0, =RESULT    ; Load address of RESULT
        STR  R2, [R0]       ; Store the sum
STOP    B STOP              ; Stop here

    AREA DATA1, DATA, READWRITE
N       DCD 10              ; Input value
RESULT  DCD 0               ; Location for result
    END
