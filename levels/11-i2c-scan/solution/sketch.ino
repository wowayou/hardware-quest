// I2C 总线扫描器 —— 看看总线上到底挂了谁
#include <Wire.h>

void scanBus() {
  int found = 0;
  Serial.println("开始扫描……");
  for (byte addr = 1; addr < 120; addr++) {
    Wire.beginTransmission(addr);
    byte err = Wire.endTransmission();
    if (err == 0) {
      Serial.print("找到设备：0x");
      if (addr < 16) Serial.print("0");
      Serial.println(addr, HEX);
      found++;
    }
  }
  Serial.print("扫描结束，共 ");
  Serial.print(found);
  Serial.println(" 个设备");
}

void setup() {
  Serial.begin(9600);
  Wire.begin();
}

void loop() {
  scanBus();
  delay(5000);
}
