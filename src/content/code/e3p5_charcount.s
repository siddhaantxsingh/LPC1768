    AREA PROGRAM5, CODE, READONLY
    ENTRY
        LDR   R0, =STRING   ; R0 = starting address of string
        LDR   R1, =CHAR
        LDRB  R2, [R1]      ; R2 = character to be searched
        MOV   R3, #0        ; R3 = occurrence count

LOOP    LDRB  R4, [R0], #1  ; Load next character
        CMP   R4, #0        ; Check for null terminator
        BEQ   DONE          ; End of string

        CMP   R4, R2        ; Compare with search character
        ADDEQ R3, R3, #1    ; Increment count if equal
        B     LOOP          ; Process next character

DONE    LDR   R0, =COUNT
        STR   R3, [R0]      ; Store occurrence count
STOP    B     STOP

    AREA DATA1, DATA, READWRITE
STRING  DCB "ARM7 ASSEMBLY LANGUAGE", 0
CHAR    DCB "A"
COUNT   DCD 0
    END
