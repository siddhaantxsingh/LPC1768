    AREA PROGRAM4, CODE, READONLY
    ENTRY
        LDR  R6, =NUM1      ; Load the first 64-bit number
        LDR  R0, [R6]       ; R0 = lower 32 bits
        LDR  R1, [R6, #4]   ; R1 = upper 32 bits
        LDR  R6, =NUM2      ; Load the second 64-bit number
        LDR  R2, [R6]       ; R2 = lower 32 bits
        LDR  R3, [R6, #4]   ; R3 = upper 32 bits
        BL   ADD64          ; Call 64-bit addition subroutine
STOP    B    STOP

; Subroutine:
ADD64
        STMFD SP!, {R4-R6, LR}  ; Save registers and return address
        ADDS  R4, R0, R2        ; Add lower 32 bits, generate carry
        ADC   R5, R1, R3        ; Add upper 32 bits + carry
        LDR   R6, =RESULT
        STR   R4, [R6]          ; Store lower 32 bits
        STR   R5, [R6, #4]      ; Store upper 32 bits
        LDMFD SP!, {R4-R6, PC}  ; Restore registers and return

    AREA DATA1, DATA, READWRITE
NUM1    DCD 0xFFFFFFFF      ; Lower word of NUM1
        DCD 0x00000001      ; Upper word of NUM1
NUM2    DCD 0x00000001      ; Lower word of NUM2
        DCD 0x00000002      ; Upper word of NUM2
RESULT  DCD 0               ; Lower word of result
        DCD 0               ; Upper word of result
    END
