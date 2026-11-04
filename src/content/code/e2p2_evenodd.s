    AREA PROGRAM2, CODE, READONLY
    ENTRY
        LDR   R0, =NUMBER   ; Load address of NUMBER
        LDR   R1, [R0]      ; R1 = NUMBER

        TST   R1, #1        ; Test least significant bit
        MOVEQ R2, #0        ; R2 = 0 if number is even
        MOVNE R2, #1        ; R2 = 1 if number is odd

        LDR   R0, =RESULT   ; Load address of RESULT
        STR   R2, [R0]      ; Store result in memory
STOP    B STOP              ; Stop here

    AREA DATA1, DATA, READWRITE
NUMBER  DCD 25              ; Input number
RESULT  DCD 0               ; 0 = Even, 1 = Odd
    END
