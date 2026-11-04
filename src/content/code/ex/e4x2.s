; Subtract two 16-bit numbers using a subroutine (R0 = A - B, 16-bit result)
    AREA EX4_2, CODE, READONLY
    ENTRY
        LDR  R2, =NUMS
        LDRH R0, [R2]           ; A
        LDRH R1, [R2, #2]       ; B
        BL   SUB16
        LDR  R2, =RESULT
        STRH R0, [R2]           ; 0x5000 - 0x1234 = 0x3DCC
STOP    B    STOP

SUB16   SUB  R0, R0, R1
        MOV  R0, R0, LSL #16    ; keep only 16 bits
        MOV  R0, R0, LSR #16
        BX   LR

    AREA DATA1, DATA, READWRITE
NUMS    DCW 0x5000, 0x1234
RESULT  DCW 0
    END
