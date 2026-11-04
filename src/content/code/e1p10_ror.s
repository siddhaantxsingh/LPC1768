    AREA PROGRAM10, CODE, READONLY
    ENTRY
        LDR R0, =0X12345678 ; 32-bit input number
        MOV R1, R0, ROR #4  ; R0 rotated right by 4 bits
STOP    B STOP              ; Infinite loop
    END
