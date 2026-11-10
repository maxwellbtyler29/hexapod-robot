#pragma once
#include <stdint.h>
#include <vector>
struct WireTx{uint8_t addr;std::vector<uint8_t> bytes;};
struct TwoWire{
 std::vector<WireTx> log;WireTx open;uint32_t clock=0;int failNext=0;bool dead=false;uint8_t mode1[2]={0x20,0x20};uint8_t pendingRead=0;
 void begin(int,int){} void setClock(uint32_t c){clock=c;} void setTimeOut(uint16_t){}
 void beginTransmission(uint8_t a){open=WireTx{a,{}};}
 size_t write(uint8_t b){open.bytes.push_back(b);return 1;}
 uint8_t endTransmission(){if(dead)return 2;if(failNext>0){--failNext;return 4;}
  if(open.bytes.size()==2&&open.bytes[0]==0)mode1[open.addr==0x41]=open.bytes[1];
  if(open.bytes.size()==1)pendingRead=open.bytes[0];
  log.push_back(open);return 0;}
 int requestFrom(int a,int n){return dead?0:n;}
 int read(){return pendingRead==0?mode1[0]:0;}
};
inline TwoWire Wire;
