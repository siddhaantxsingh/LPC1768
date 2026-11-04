    AREA PROGRAM5, CODE, READONLY
    ENTRY
        LDR R0, =0x12345678 ; Load a 32-bit number
        MVN R1, R0          ; R1 = NOT R0
STOP    B STOP              ; Infinite loop
    END
