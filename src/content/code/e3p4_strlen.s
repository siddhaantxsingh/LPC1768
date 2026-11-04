    AREA PROGRAM4, CODE, READONLY
    ENTRY
        LDR  R0, =STRING    ; R0 = starting address of string
        MOV  R1, #0         ; R1 = character count

LOOP    LDRB R2, [R0], #1   ; Load character and increment pointer
        CMP  R2, #0         ; Check for null character
        BEQ  DONE           ; Exit if null character is found
        ADD  R1, R1, #1     ; Increment character count
        B    LOOP           ; Process next character

DONE    LDR  R0, =COUNT
        STR  R1, [R0]       ; Store character count
STOP    B    STOP

    AREA DATA1, DATA, READWRITE
STRING  DCB "ARM7 PROGRAM", 0
COUNT   DCD 0
    END
