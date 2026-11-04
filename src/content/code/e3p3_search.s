    AREA PROGRAM3, CODE, READONLY
    ENTRY
        LDR  R0, =ARRAY     ; R0 = starting address of array
        LDR  R1, =SEARCH
        LDR  R2, [R1]       ; R2 = number to be searched
        MOV  R3, #5         ; R3 = number of array elements
        MOV  R4, #0         ; R4 = array index

LOOP    LDR  R5, [R0], #4   ; Load next array element
        CMP  R5, R2         ; Compare with search value
        BEQ  FOUND          ; If equal, element is found
        ADD  R4, R4, #1     ; Increment array index
        SUBS R3, R3, #1     ; Decrement element counter
        BNE  LOOP           ; Continue searching

        MVN  R4, #0         ; R4 = -1 (not found)
FOUND   LDR  R0, =RESULT
        STR  R4, [R0]       ; Store index
STOP    B    STOP

    AREA DATA1, DATA, READWRITE
ARRAY   DCD 10, 25, 40, 55, 70
SEARCH  DCD 40              ; Number to be searched
RESULT  DCD 0               ; Index, or -1 if not found
    END
