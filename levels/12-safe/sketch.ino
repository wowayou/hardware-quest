// 师傅的保险箱 —— 旋钮、按钮、一盏灯
const int POT_PIN = A0;
const int BTN_PIN = 12;
const int LED_PIN = 8;
const byte CODE[6] = { 0x67, 0x6b, 0x79, 0x7e, 0x6f, 0x78 };
const byte KEY = 0x2a;

int lastLevel = HIGH;
int presses = 0;
unsigned long lastPress = 0;
unsigned long lastReport = 0;
bool unlocked = false;

void setup() {
  Serial.begin(9600);
  pinMode(BTN_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  lastLevel = digitalRead(BTN_PIN);
}

void loop() {
  int raw = analogRead(POT_PIN);
  float volts = raw / 1023 * 5;
  int level = digitalRead(BTN_PIN);

  if (lastLevel == HIGH && level == LOW) {
    presses++;
    lastPress = millis();
  }
  lastLevel = level;

  if (!unlocked) {
    if (millis() - lastReport > 500) {
      lastReport = millis();
      Serial.print("电压=");
      Serial.print(volts, 2);
      Serial.print("V  按钮=");
      Serial.print(level == LOW ? "按下" : "松开");
      Serial.print("  计数=");
      Serial.println(presses);
    }

    // 最后一次按键过去 2 秒，结算
    if (presses > 0 && millis() - lastPress > 2000) {
      bool voltOk = fabs(volts - 2.5) <= 0.1;
      if (voltOk && presses == 3) {
        unlocked = true;
      } else {
        Serial.print("没开：");
        if (!voltOk) Serial.print("电压不对；");
        if (presses != 3) Serial.print("按键次数不对；");
        Serial.println("计数清零");
      }
      presses = 0;
    }
  } else {
    digitalWrite(LED_PIN, HIGH);
    if (millis() - lastReport > 2000) {
      lastReport = millis();
      Serial.print("咔哒，保险箱开了。口令：");
      for (int i = 0; i < 6; i++) {
        Serial.print((char)(CODE[i] ^ KEY));
      }
      Serial.println();
    }
  }
}
