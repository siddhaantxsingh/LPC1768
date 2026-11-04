    AREA PROGRAM1, CODE, READONLY
    ENTRY
        LDR   R2, =NUMBER   ; Load address of NUMBER
        LDR   R0, [R2]      ; R0 = signed number
        CMP   R0, #0        ; Compare number with zero
        MOVGT R1, #1        ; R1 = 1 if positive
        MOVEQ R1, #0        ; R1 = 0 if zero
        MVNLT R1, #0        ; R1 = 0xFFFFFFFF (-1) if negative
STOP    B STOP              ; Stop here

    AREA DATA1, DATA, READWRITE
NUMBER  DCD -25             ; Input signed number
    END
