    AREA PROGRAM2, CODE, READONLY
    ENTRY
        MOV R0, #25         ; First number
        MOV R1, #12         ; Second number
        MUL R2, R0, R1      ; R2 = R0 x R1
STOP    B STOP              ; Infinite loop
    END
