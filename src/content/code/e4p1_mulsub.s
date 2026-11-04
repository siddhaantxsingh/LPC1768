    AREA PROGRAM1, CODE, READONLY
    ENTRY
        ; Main program:
        LDR  R2, =NUM       ; Load address of NUM
        LDR  R0, [R2], #4   ; R0 = 1st number
        LDR  R1, [R2]       ; R1 = 2nd number

        BL   PRODUCT        ; Call subroutine, product returned in R0
        LDR  R2, =RESULT    ; Load address of RESULT
        STR  R0, [R2]       ; Store product in data memory
STOP    B    STOP

; Subroutine:
PRODUCT
        MUL  R0, R0, R1     ; R0 = R0 * R1
        BX   LR             ; Return to main program

    AREA DATA1, DATA, READWRITE
NUM     DCD 25, 15          ; Input numbers
RESULT  DCD 0               ; Location for result
    END
