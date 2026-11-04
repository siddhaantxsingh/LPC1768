NUM1    EQU 0x12345678
NUM2    EQU 0x11111111
    AREA PROGRAM4, CODE, READONLY
    ENTRY
        MOV R0, #NUM1       ; First number
        MOV R1, #NUM2       ; Second number
        AND R2, R0, R1      ; R2 = R0 AND R1
        ORR R3, R0, R1      ; R3 = R0 OR R1
        EOR R4, R0, R1      ; R4 = R0 XOR R1
STOP    B STOP              ; Infinite loop
    END
