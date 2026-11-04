    AREA PROGRAM2, CODE, READONLY
    ENTRY
        LDR   R0, =ARRAY    ; R0 = starting address of array
        LDR   R2, [R0], #4  ; R2 = first element (largest so far)
        MOV   R1, #4        ; Remaining number of elements

LOOP    LDR   R3, [R0], #4  ; Load next array element
        CMP   R3, R2        ; Compare element with largest
        MOVHI R2, R3        ; If R3 > R2, update largest
        SUBS  R1, R1, #1    ; Decrement counter
        BNE   LOOP          ; Repeat for remaining elements

        LDR   R0, =RESULT
        STR   R2, [R0]      ; Store largest value
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
ARRAY   DCD 25, 60, 15, 90, 40
RESULT  DCD 0
    END
