    AREA PROGRAM1, CODE, READONLY
    ENTRY
        LDR  R0, =NUMBER    ; Address of input number
        LDR  R1, [R0]       ; R1 = input number
        LDR  R2, =RESULT    ; R2 = address of result array
        MOV  R3, R1         ; R3 = first multiple
        MOV  R4, #10        ; Loop counter = 10

LOOP    STR  R3, [R2], #4   ; Store multiple and R2 = R2 + 4
        ADD  R3, R3, R1     ; Generate next multiple
        SUBS R4, R4, #1     ; Decrement counter
        BNE  LOOP           ; Repeat 10 times
STOP    B    STOP

    AREA DATA1, DATA, READWRITE
NUMBER  DCD   5             ; Input number
RESULT  SPACE 40            ; Space for 10 words (10 x 4 bytes)
    END
