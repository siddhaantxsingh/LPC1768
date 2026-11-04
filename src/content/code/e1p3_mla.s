    AREA PROGRAM3, CODE, READONLY
    ENTRY
        MOV R0, #10         ; First number
        MOV R1, #5          ; Second number
        MOV R2, #20         ; Third number
        MLA R3, R0, R1, R2  ; R3 = (R0 x R1) + R2
STOP    B STOP              ; Infinite loop
    END
