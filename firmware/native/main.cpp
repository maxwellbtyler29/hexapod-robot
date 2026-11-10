#include "../core/telemetry.h"
#include <iostream>
#include <string>
int main(){
    control::Controller robot;
    std::string line;
    while(std::getline(std::cin,line)){
        std::istringstream in(line);char kind=0;in>>kind;bool accepted=false;
        if(kind=='T'){
            double now=0,dt=0;std::string extra;
            if((in>>now>>dt)&&!(in>>extra)){robot.tick(dt,now);accepted=true;}
        }else if(kind=='C'){
            control::Command c;double now=0;std::string extra;
            if((in>>now>>c.session>>c.seq>>c.mode>>c.x>>c.y>>c.gain>>c.leg>>c.lift>>c.action>>c.routine)&&!(in>>extra))accepted=robot.accept(c,now);
        }else if(kind=='S')accepted=true;
        std::cout<<control::telemetry(robot,accepted)<<std::endl;
    }
}
