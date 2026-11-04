    AREA PROGRAM3, CODE, READONLY
    ENTRY
        LDR   R0, =NUM1     ; Address of first number
        LDR   R1, =NUM2     ; Address of second number
        LDR   R2, [R0]      ; R2 = NUM1
        LDR   R3, [R1]      ; R3 = NUM2

        CMP   R2, R3        ; Compare NUM1 with NUM2
        MOVHI R4, R2        ; If NUM1 > NUM2, R4 = NUM1
        MOVLS R4, R3        ; Otherwise, R4 = NUM2

        LDR   R0, =RESULT   ; Address of result
        STR   R4, [R0]      ; Store larger number
STOP    B STOP              ; Stop here

    AREA DATA1, DATA, READWRITE
NUM1    DCD 25              ; First unsigned number
NUM2    DCD 40              ; Second unsigned number
RESULT  DCD 0               ; Location for storing larger number
    END
