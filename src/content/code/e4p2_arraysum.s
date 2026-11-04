    AREA PROGRAM2, CODE, READONLY
    ENTRY
        ; Main program:
        LDR  R0, =ARRAY     ; R0 = base address of array
        MOV  R1, #5         ; R1 = number of elements
        BL   ARRAY_SUM      ; Call subroutine; sum returned in R0
        LDR  R2, =RESULT
        STR  R0, [R2]       ; Store result in memory
STOP    B    STOP

; Subroutine:
ARRAY_SUM
        MOV  R2, #0         ; R2 = sum = 0
        CMP  R1, #0         ; Check for empty array
        BEQ  SUM_DONE

SUM_LOOP
        LDR  R3, [R0], #4   ; Load element, advance pointer
        ADD  R2, R2, R3     ; Sum = Sum + element
        SUBS R1, R1, #1     ; Decrement element counter
        BNE  SUM_LOOP

SUM_DONE
        MOV  R0, R2         ; Return sum in R0
        BX   LR             ; Return to main program

    AREA DATA1, DATA, READWRITE
ARRAY   DCD 10, 20, 30, 40, 50
RESULT  DCD 0
    END
