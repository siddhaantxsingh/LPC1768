    AREA PROGRAM9, CODE, READONLY
    ENTRY
        MOV R0, #80         ; Input number
        MOV R1, R0, LSR #1  ; R1 = R0 / 2
STOP    B STOP              ; Infinite loop
    END
