// 旋钮保险箱 —— 旋钮拧到对的电压，停稳 2 秒才开
const int POT_PIN = A0;
const byte CODE[4] = { 0x21, 0x2a, 0x2e, 0x2b };
const byte KEY = 0x19;

unsigned long stableSince = 0;
bool unlocked = false;
unsigned long lastShow = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(POT_PIN);
  float volts = raw / 1023 * 5;

  Serial.print("读数=");
  Serial.print(raw);
  Serial.print("  电压=");
  Serial.print(volts, 2);
  Serial.println("V");

  if (!unlocked) {
    if (fabs(volts - 3.3) <= 0.05) {
      if (stableSince == 0) stableSince = millis();
      if (millis() - stableSince >= 2000) unlocked = true;
    } else {
      stableSince = 0;
    }
  }

  if (unlocked && millis() - lastShow > 1000) {
    lastShow = millis();
    Serial.print("保险箱开了！口令：");
    for (int i = 0; i < 4; i++) {
      Serial.print((char)(CODE[i] ^ KEY));
    }
    Serial.println();
  }
  delay(200);
}
