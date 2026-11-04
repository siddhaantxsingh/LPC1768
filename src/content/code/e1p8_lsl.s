    AREA PROGRAM8, CODE, READONLY
    ENTRY
        MOV R0, #25         ; Input number
        MOV R1, R0, LSL #1  ; Multiply by 2
        MOV R2, R0, LSL #2  ; R2 = R0 x 4
        MOV R3, R0, LSL #3  ; R3 = R0 x 8
STOP    B STOP              ; Infinite loop
    END
