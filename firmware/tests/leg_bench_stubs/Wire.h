#pragma once
struct TwoWire {
  void begin(int,int) {}
  void setClock(unsigned) {}
  void setTimeOut(unsigned) {}
};
inline TwoWire Wire;
