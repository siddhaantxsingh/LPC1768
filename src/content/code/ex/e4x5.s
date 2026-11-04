; Sum of two 4-digit BCD numbers using a subroutine
; 4789 + 3456 = 8245  (result keeps a carry digit: 0x00008245)
    AREA EX4_5, CODE, READONLY
    ENTRY
        LDR   R2, =BCD1
        LDR   R0, [R2]
        LDR   R1, [R2, #4]
        BL    BCDADD
        LDR   R2, =RESULT
        STR   R0, [R2]
STOP    B     STOP

; R0 = R0 + R1 in BCD, digit by digit
BCDADD  STMFD SP!, {R4-R7, LR}
        MOV   R4, #0            ; result
        MOV   R5, #0            ; carry
        MOV   R6, #0            ; shift amount (0, 4, 8, 12, 16)
DIGIT   MOV   R2, R0, LSR R6
        AND   R2, R2, #0xF      ; digit of A
        MOV   R3, R1, LSR R6
        AND   R3, R3, #0xF      ; digit of B
        ADD   R7, R2, R3
        ADD   R7, R7, R5        ; + carry
        CMP   R7, #9
        SUBHI R7, R7, #10       ; decimal adjust
        MOVHI R5, #1
        MOVLS R5, #0
        ORR   R4, R4, R7, LSL R6
        ADD   R6, R6, #4
        CMP   R6, #16
        BNE   DIGIT
        ORR   R4, R4, R5, LSL #16   ; final carry digit
        MOV   R0, R4
        LDMFD SP!, {R4-R7, PC}

    AREA DATA1, DATA, READWRITE
BCD1    DCD 0x4789
BCD2    DCD 0x3456
RESULT  DCD 0
    END
