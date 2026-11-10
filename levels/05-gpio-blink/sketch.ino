// 夜班信号灯 —— 师傅交代的活，我先写到这儿
const int SIGNAL_PIN = 8;

// 暗号本，别让学徒看见
const byte CODEBOOK[] = { 89, 91, 94, 88 };
const byte MASK = 0x5A;

const int ON_MS = 250;
const int OFF_MS = 250;
const int GROUP_GAP_MS = 1500;
const int ROUND_GAP_MS = 4000;

void setup() {
  pinMode(SIGNAL_PIN, OUTPUT);
}

void loop() {
  for (int i = 0; i < 4; i++) {
    int times = CODEBOOK[i] ^ MASK;
    for (int n = 0; n < times; n++) {
      digitalWrite(SIGNAL_PIN, HIGH);
      delay(ON_MS);
      digitalWrite(SIGNAL_PIN, LOW);
      delay(OFF_MS);
    }
    delay(GROUP_GAP_MS);
  }
  delay(ROUND_GAP_MS);
}
