    AREA PROGRAM1, CODE, READONLY
    ENTRY
        MOV R0, #0X20       ; First number
        MOV R1, #0X10       ; Second number
        ADD R2, R0, R1      ; R2 = R0 + R1
        SUB R3, R0, R1      ; R3 = R0 - R1
STOP    B STOP              ; Infinite loop
    END
