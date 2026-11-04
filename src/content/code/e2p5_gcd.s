    AREA PROGRAM5, CODE, READONLY
    ENTRY
        LDR   R0, =NUM1     ; Address of first number
        LDR   R1, [R0]      ; R1 = NUM1
        LDR   R0, =NUM2     ; Address of second number
        LDR   R2, [R0]      ; R2 = NUM2

LOOP    CMP   R1, R2        ; Compare the two numbers
        BEQ   DONE          ; If equal, GCD is found

        SUBHI R1, R1, R2    ; If R1 > R2, R1 = R1 - R2
        SUBLO R2, R2, R1    ; If R2 > R1, R2 = R2 - R1
        B     LOOP          ; Repeat

DONE    LDR   R0, =RESULT
        STR   R1, [R0]      ; Store GCD
STOP    B     STOP          ; Stop here

    AREA DATA1, DATA, READWRITE
NUM1    DCD 48              ; First positive integer
NUM2    DCD 18              ; Second positive integer
RESULT  DCD 0               ; Location to store GCD
    END
