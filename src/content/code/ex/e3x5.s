; Is a string a palindrome?  RESULT = 1 (yes) or 0 (no)
    AREA EX3_5, CODE, READONLY
    ENTRY
        LDR   R0, =STR1         ; left pointer
        MOV   R1, R0
FIND    LDRB  R2, [R1]          ; move R1 to the terminating 0
        CMP   R2, #0
        ADDNE R1, R1, #1
        BNE   FIND
        SUB   R1, R1, #1        ; right pointer = last character
        MOV   R4, #1            ; assume palindrome
CHECK   CMP   R0, R1
        BHS   DONE              ; pointers met
        LDRB  R2, [R0], #1
        LDRB  R3, [R1], #-1
        CMP   R2, R3
        MOVNE R4, #0
        BNE   DONE
        B     CHECK
DONE    LDR   R0, =RESULT
        STR   R4, [R0]
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
STR1    DCB "MALAYALAM", 0
        ALIGN
RESULT  DCD 0
    END
