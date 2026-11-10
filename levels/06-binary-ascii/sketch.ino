// 电报机 v0.2 —— 八盏灯排成一排，一次亮一个字节
// 最左边那盏接 12 脚，往右依次是 11、10、9、8、7、6、5
const int BIT_PINS[8] = { 12, 11, 10, 9, 8, 7, 6, 5 };

// 电文（四个字节，抄的时候顺手加了密）
const byte MSG[4] = { 0x71, 0x62, 0x64, 0x72 };
const byte KEY = 0x37;

void showByte(byte v) {
  for (int i = 0; i < 8; i++) {
    digitalWrite(BIT_PINS[i], (v >> (7 - i)) & 1);
  }
}

void setup() {
  for (int i = 0; i < 8; i++) {
    pinMode(BIT_PINS[i], OUTPUT);
  }
}

void loop() {
  for (int i = 0; i < 4; i++) {
    showByte(MSG[i] ^ KEY);
    delay(3000);
    showByte(0);
    delay(500);
  }
  delay(5000);
}
