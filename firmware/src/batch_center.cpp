#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
// Six loose servos, channels 0..5. Boot is OFF. No app joystick commands.
Adafruit_PWMServoDriver pca(0x40,Wire);
bool ready=false,active=false;
uint8_t centered=0;
uint32_t started=0,nextAt=0;
char buffer[24]; unsigned used=0; bool overflow=false;
bool off(){bool ok=true;for(int ch=0;ch<16;++ch)if(pca.setPWM(ch,0,4096))ok=false;active=false;centered=0;return ok;}
void fault(){off();ready=false;Serial.println("FAULT: unplug battery; reset required.");}
void status(){Serial.printf("BATCH ready=%d active=%d centered=%u channels=0..5 pulse_us=1500 hold_ms=120000\n",ready,active,centered);}
void execute(const char* cmd){
 if(!strcmp(cmd,"STATUS")){status();return;}
 if(!strcmp(cmd,"OFF")){if(!off())fault();status();return;}
 if(strcmp(cmd,"CENTER6")){Serial.println("Commands: STATUS CENTER6 OFF");return;}
 if(!ready){Serial.println("Not ready");return;}
 if(active){Serial.println("Already centering/holding; OFF before another batch.");return;}
 active=true;centered=0;started=millis();nextAt=started;status();
}
void setup(){Serial.begin(115200);Wire.begin(21,22);Wire.setClock(100000);Wire.setTimeOut(50);
 if(!pca.begin()){Serial.println("No PCA at 0x40");return;}
 if(!off()){fault();return;}pca.setPWMFreq(50);
 if(pca.readPrescale()!=121||!off()){fault();return;}ready=true;status();
}
void loop(){
 // Process OFF before generating any additional output.
 for(unsigned n=0;n<32&&Serial.available();++n){char c=char(Serial.read());
  if(c=='\r'||c=='\n'){if(overflow)Serial.println("Invalid command");else if(used){buffer[used]=0;execute(buffer);}used=0;overflow=false;}
  else if(c<32||c>126)overflow=true;
  else if(!overflow){if(used<sizeof(buffer)-1)buffer[used++]=c;else overflow=true;}
 }
 if(active){uint32_t now=millis();
  if(uint32_t(now-started)>=120000){if(!off())fault();Serial.println("Hold expired: outputs OFF");status();}
  else if(centered<6&&int32_t(now-nextAt)>=0){
   // Prescale 121, nominal 25 MHz clock: 1500 us -> 307 ticks.
   if(pca.setPWM(centered,0,307)){fault();return;}
   ++centered;nextAt=now+500;status();
  }
 }
 delay(1);
}
