#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
// Keep Arduino's conversion macros from replacing the portable IK functions.
#undef radians
#undef degrees
#include "../core/telemetry.h"
#include "hardware_config.h"
#if __has_include("wifi_secrets.h")
#include "wifi_secrets.h"
#else
#include "wifi_secrets.example.h"
#endif
#include "web_page.h"

WebServer server(80);
control::Controller robot;
Adafruit_PWMServoDriver board0(hardware::addresses[0]),board1(hardware::addresses[1]);
const auto calibration=hardware::calibration();
bool outputStarted=false,outputFailed=false;
uint32_t lastTick=0;
double elapsed=0;

bool number(const char* key,double& out){
    if(!server.hasArg(key))return false;
    const String s=server.arg(key);char* end=nullptr;
    out=strtod(s.c_str(),&end);
    return end!=s.c_str()&&*end=='\0'&&std::isfinite(out);
}
bool integer(const char* key,int& out){double n;if(!number(key,n)||n<0||n>100||n!=std::floor(n))return false;out=int(n);return true;}
bool identifier(const char* key,uint32_t& out){double n;if(!number(key,n)||n<1||n>4294967295.0||n!=std::floor(n))return false;out=uint32_t(n);return true;}
void state(bool accepted=true,int status=200){
    server.sendHeader("Cache-Control","no-store");
    const std::string body=control::telemetry(robot,accepted,"esp32");
    server.send(status,"application/json",body.c_str());
}
void command(){
    const String origin=server.header("Origin");
    if(origin.length()&&origin!=String("http://")+server.hostHeader()){
        server.send(403,"application/json","{\"error\":\"Origin rejected\"}");return;
    }
    control::Command c;
    if(server.args()!=10||!identifier("session",c.session)||!identifier("seq",c.seq)||!integer("mode",c.mode)
       ||!number("x",c.x)||!number("y",c.y)||!number("gain",c.gain)||!integer("leg",c.leg)
       ||!number("lift",c.lift)||!integer("action",c.action)||!integer("routine",c.routine)){
        server.send(400,"application/json","{\"error\":\"Malformed command\"}");return;
    }
    const bool ok=robot.accept(c,elapsed);state(ok,ok?200:409);
}
void servoOutput(){
    if(!hardware::enableServoOutput||!hardware::assemblyGeometryVerified||outputFailed)return;
    std::array<double,18> pulses;
    if(!control::posePulses(robot,calibration,pulses)){
        outputFailed=true;robot.enabled=false;robot.fault=true;robot.message="Servo calibration/range check failed. Previous pulses held.";return;
    }
    if(!outputStarted){
        if(!robot.enabled)return;
        Wire.begin(hardware::sdaPin,hardware::sclPin);
        if(!board0.begin()||!board1.begin()){outputFailed=true;robot.enabled=false;robot.fault=true;robot.message="PCA9685 not found.";return;}
        board0.setPWMFreq(50);board1.setPWMFreq(50);outputStarted=true;
    }
    // All 18 values validated before any write. Hold torque on normal stops.
    // Actual I2C errors still require hardware fault handling and bench testing.
    for(int i=0;i<18;++i){
        auto& driver=calibration[i].board==0?board0:board1;
        driver.writeMicroseconds(calibration[i].channel,uint16_t(std::lround(pulses[i])));
    }
}
void setup(){
    Serial.begin(115200);
    WiFi.mode(WIFI_AP);
    // Setup password for a private bench AP. Change before field use.
    if(!WiFi.softAP(HEXAPOD_AP_SSID,HEXAPOD_AP_PASSWORD)){Serial.println("AP startup failed");return;}
    const char* headers[]={"Origin"};server.collectHeaders(headers,1);
    server.on("/",HTTP_GET,[]{server.sendHeader("Content-Encoding","gzip");server.send_P(200,"text/html",reinterpret_cast<const char*>(WEB_PAGE),sizeof(WEB_PAGE));});
    server.on("/api/state",HTTP_GET,[]{state();});server.on("/api/command",HTTP_POST,command);
    server.onNotFound([]{server.send(404,"application/json","{\"error\":\"Not found\"}");});
    server.begin();lastTick=millis();Serial.print("Dry-run controller: http://");Serial.println(WiFi.softAPIP());
    Serial.println("Servo output disabled. Telemetry is commanded, not measured.");
}
void loop(){
    server.handleClient();
    const uint32_t stamp=millis();const uint32_t delta=stamp-lastTick;
    if(delta>=20){lastTick=stamp;const double dt=delta*.001;elapsed+=dt;robot.tick(dt,elapsed);servoOutput();}
    delay(1);
}
