// 按键计数器 —— 按 4 下，停 3 秒不动，数对了才给口令
const int BTN_PIN = 2;
const byte CODE[4] = { 0x1f, 0x0a, 0x1b, 0x0e };
const byte KEY = 0x4b;
const unsigned long DEBOUNCE_MS = 30;

int count = 0;
int stableLevel = HIGH;
int lastReading = HIGH;
unsigned long lastChange = 0;
unsigned long lastPress = 0;
bool unlocked = false;
unsigned long lastShow = 0;

void setup() {
  Serial.begin(9600);
  pinMode(BTN_PIN, INPUT_PULLUP);
  Serial.println("准备好了：按 4 下，然后别动");
}

void loop() {
  int reading = digitalRead(BTN_PIN);
  if (reading != lastReading) {
    lastChange = millis();
    lastReading = reading;
  }
  // 读数稳定超过 DEBOUNCE_MS，才承认它变了
  if (millis() - lastChange > DEBOUNCE_MS && reading != stableLevel) {
    stableLevel = reading;
    if (stableLevel == LOW) {
      count++;
      lastPress = millis();
      Serial.print("计数 ");
      Serial.println(count);
    }
  }

  // 3 秒没有新的按键，结算
  if (count > 0 && millis() - lastPress > 3000) {
    if (count == 4) {
      unlocked = true;
    } else {
      Serial.print("数错了：实际数到 ");
      Serial.print(count);
      Serial.println(" 次，清零重来");
    }
    count = 0;
  }

  if (unlocked && millis() - lastShow > 2000) {
    lastShow = millis();
    Serial.print("口令：");
    for (int i = 0; i < 4; i++) {
      Serial.print((char)(CODE[i] ^ KEY));
    }
    Serial.println();
  }
}
