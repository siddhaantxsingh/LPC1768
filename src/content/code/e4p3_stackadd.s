    AREA PROGRAM3, CODE, READONLY
    ENTRY
        MOV   R0, #12
        MOV   R1, #8
        STMFD SP!, {R0, R1} ; Push operands
        BL    ADD_STACK
STOP    B     STOP

ADD_STACK
        LDMFD SP!, {R2, R3} ; Pop operands
        ADD   R4, R2, R3    ; R4 = sum
        BX    LR
    END
