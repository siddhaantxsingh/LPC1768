; Multiply two 64-bit numbers using a subroutine -> 128-bit product
; A = AH:AL, B = BH:BL
; A x B = AL*BL + (AL*BH + AH*BL) << 32 + AH*BH << 64
    AREA EX4_3, CODE, READONLY
    ENTRY
        LDR   SP, =0x40008000   ; stack at the top of RAM (a Keil startup file normally does this)
        LDR   R0, =A
        LDMIA R0, {R0-R3}       ; R0 = AL, R1 = AH, R2 = BL, R3 = BH
        BL    MUL64
STOP    B     STOP

MUL64   STMFD SP!, {R4-R9, LR}
        UMULL R4, R5, R0, R2    ; R5:R4      = AL*BL
        UMULL R6, R7, R1, R3    ; R7:R6      = AH*BH   (bits 64..127)
        UMULL R8, R9, R0, R3    ; R9:R8      = AL*BH   (shift by 32)
        ADDS  R5, R5, R8
        ADCS  R6, R6, R9
        ADC   R7, R7, #0
        UMULL R8, R9, R1, R2    ; R9:R8      = AH*BL   (shift by 32)
        ADDS  R5, R5, R8
        ADCS  R6, R6, R9
        ADC   R7, R7, #0
        LDR   R8, =PRODUCT
        STMIA R8, {R4-R7}       ; least significant word first
        LDMFD SP!, {R4-R9, PC}

    AREA DATA1, DATA, READWRITE
A       DCD 0x89ABCDEF, 0x01234567  ; A = 0x0123456789ABCDEF
B       DCD 0x00000010, 0x00000001  ; B = 0x0000000100000010
PRODUCT SPACE 16                    ; = 0x00000000_01234567_9BE02467_9ABCDEF0
    END
