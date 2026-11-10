// 门铃控制器 —— 按三下，门锁给你一句口令
const int BELL_PIN = 2;
const byte CODE[4] = { 0x1b, 0x1e, 0x15, 0x18 };
const byte KEY = 0x2c;

bool boardOk = true;
int rings = 0;
bool unlocked = false;
int lastLevel;
unsigned long lastShow = 0;

void setup() {
  Serial.begin(9600);
  pinMode(BELL_PIN, INPUT);
  delay(100);

  // 开机自检：没人按的时候，门铃脚应该读到 HIGH
  int lows = 0;
  for (int i = 0; i < 20; i++) {
    if (digitalRead(BELL_PIN) == LOW) lows++;
    delay(5);
  }
  if (lows > 0) {
    boardOk = false;
    Serial.println("自检失败：没人按门铃，输入脚却读到了 LOW");
  } else {
    Serial.println("自检通过：松开时读到 HIGH，可以开始数门铃");
  }
  lastLevel = digitalRead(BELL_PIN);
}

void loop() {
  if (!boardOk) {
    Serial.println("门铃一直在响，我拒绝工作。");
    delay(2000);
    return;
  }

  int level = digitalRead(BELL_PIN);
  if (lastLevel == HIGH && level == LOW) {
    rings++;
    Serial.print("叮咚！第 ");
    Serial.print(rings);
    Serial.println(" 声");
    if (rings == 3) unlocked = true;
  }
  lastLevel = level;

  if (unlocked && millis() - lastShow > 2000) {
    lastShow = millis();
    Serial.print("口令：");
    for (int i = 0; i < 4; i++) {
      Serial.print((char)(CODE[i] ^ KEY));
    }
    Serial.println();
  }
}
