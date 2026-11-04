    AREA PROGRAM5, CODE, READONLY
    ENTRY
        LDR   R12, =SOURCE
        LDR   R13, =DEST
        LDMIA R12!, {R0-R11}    ; Load 12 words to registers
        STMIA R13!, {R0-R11}    ; Store the 12 words to memory
        LDMIA R12!, {R0-R2}     ; Load next 3 words to registers
        STMIA R13!, {R0-R2}     ; Store the 3 words to memory
STOP    B STOP
SOURCE  DCD 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xA, 0xB, 0xC, 0xD, 0xE, 0xF

    AREA DATA1, DATA, READWRITE
DEST    DCW 0
    END
