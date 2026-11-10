// 调光台灯 —— 想让灯暗一点，所以不要全亮
const int LED_PIN = 4;     // 灯接在这
const int SENSE_PIN = 7;   // 一根线从灯的引脚拉回来，用来量波形
const byte CODE[4] = { 0x25, 0x22, 0x27, 0x26 };
const byte KEY = 0x63;

bool unlocked = false;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
  pinMode(SENSE_PIN, INPUT);
  analogWrite(LED_PIN, 191);
}

void loop() {
  unsigned long high = pulseIn(SENSE_PIN, HIGH, 50000UL);
  unsigned long low = pulseIn(SENSE_PIN, LOW, 50000UL);

  if (high == 0 || low == 0) {
    Serial.println("没有脉冲：电平一直不变");
  } else {
    float duty = 100.0 * high / (high + low);
    Serial.print("高 ");
    Serial.print(high);
    Serial.print(" us，低 ");
    Serial.print(low);
    Serial.print(" us，占空比 ");
    Serial.print(duty, 1);
    Serial.println("%");
    if (duty >= 22.0 && duty <= 28.0) unlocked = true;
  }

  if (unlocked) {
    Serial.print("亮度刚刚好！口令：");
    for (int i = 0; i < 4; i++) {
      Serial.print((char)(CODE[i] ^ KEY));
    }
    Serial.println();
  }
  delay(1000);
}
