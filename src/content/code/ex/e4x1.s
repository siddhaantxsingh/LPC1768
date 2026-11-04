; Add two 16-bit numbers using a subroutine (17-bit result keeps the carry)
    AREA EX4_1, CODE, READONLY
    ENTRY
        LDR  R2, =NUMS
        LDRH R0, [R2]           ; first 16-bit number
        LDRH R1, [R2, #2]       ; second 16-bit number
        BL   ADD16
        LDR  R2, =RESULT
        STR  R0, [R2]           ; 0xFFFF + 0x1234 = 0x11233
STOP    B    STOP

ADD16   ADD  R0, R0, R1         ; R0 = R0 + R1
        BX   LR

    AREA DATA1, DATA, READWRITE
NUMS    DCW 0xFFFF, 0x1234
RESULT  DCD 0
    END
