; Copy a 5-element array into another array in reverse order
    AREA EX3_3, CODE, READONLY
    ENTRY
        LDR  R0, =SRC
        LDR  R1, =DST+16        ; last element of the destination
        MOV  R2, #5
LOOP    LDR  R3, [R0], #4       ; read forwards
        STR  R3, [R1], #-4      ; write backwards
        SUBS R2, R2, #1
        BNE  LOOP
STOP    B    STOP

    AREA DATA1, DATA, READWRITE
SRC     DCD 1, 2, 3, 4, 5
DST     SPACE 20                ; becomes 5, 4, 3, 2, 1
    END
