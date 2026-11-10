function results = run_hexapod_demo(doAnimate)
% Base MATLAB only. Example: run_hexapod_demo(true)
% Preview of geometry and a slow wave gait with a fixed body.
% No contact dynamics, servo model, traction prediction or electronics.
if nargin<1, doAnimate=true; end
p=hexapod_parameters();
out=fullfile(fileparts(mfilename('fullpath')),'results');
if ~exist(out,'dir'), mkdir(out); end
t=0:p.dt:p.period;
Q=zeros(numel(t),18); margins=zeros(size(t)); err=0;
fig=figure('Color','w','Position',[100 100 1100 520],'Visible','off');
if doAnimate, fig.Visible='on'; end
for k=1:numel(t)
    feet=zeros(3,6); legs=zeros(3,4,6); stance=false(1,6);
    for j=1:6
        a=p.mountAngle(j); R=[cos(a) -sin(a) 0;sin(a) cos(a) 0;0 0 1];
        [dx,dz,stance(j)]=foot_path(t(k)/p.period+p.phase(j),p);
        target=[p.footRadius;0;-p.height]+R'*[dx;0;dz];
        [q,ok]=leg_ik(target,p.L);
        assert(ok,'Foot target is outside leg workspace');
        assert(all(q>=p.qMin & q<=p.qMax),'Study joint limit exceeded');
        local=leg_fk(q,p.L);
        err=max(err,norm(local(:,end)-target));
        legs(:,:,j)=R*local+p.mount(:,j)+[0;0;p.height];
        feet(:,j)=legs(:,end,j);
        Q(k,(j-1)*3+(1:3))=q;
    end
    contact=feet(1:2,stance)'; hull=convhull(contact(:,1),contact(:,2));
    polygon=contact(hull,:);
    inside=inpolygon(0,0,polygon(:,1),polygon(:,2));
    d=inf;
    for e=1:size(polygon,1)-1
        a=polygon(e,:); v=polygon(e+1,:)-a;
        u=max(0,min(1,dot(-a,v)/dot(v,v)));
        d=min(d,norm(a+u*v));
    end
    margins(k)=d*(2*inside-1);
    if doAnimate || k==round(numel(t)/2)+3
        clf(fig);
        subplot(1,2,1); hold on; axis equal; grid on;
        fill3(p.mount(1,:),p.mount(2,:),p.height*ones(1,6),[.15 .22 .27]);
        for j=1:6
            P=legs(:,:,j);
            plot3(P(1,:),P(2,:),P(3,:),'-o','LineWidth',3,'Color',[.88 .36 .13]);
            text(P(1,end),P(2,end),P(3,end)+.01,p.legName{j});
        end
        xlabel('x forward (m)'); ylabel('y left (m)'); zlabel('z up (m)');
        xlim([-.23 .23]); ylim([-.23 .23]); zlim([0 .19]); view(38,27);
        title('Geometry preview - fixed body');
        subplot(1,2,2); hold on; axis equal; grid on;
        fill(polygon(:,1),polygon(:,2),[.83 .92 .92],'EdgeColor',[.1 .5 .5]);
        plot(feet(1,stance),feet(2,stance),'ko','MarkerFaceColor','k');
        plot(feet(1,~stance),feet(2,~stance),'o','Color',[.88 .36 .13],'LineWidth',2);
        plot(0,0,'+','MarkerSize',12,'LineWidth',2,'Color',[.8 .1 .1]);
        xlabel('x forward (m)'); ylabel('y left (m)');
        xlim([-.23 .23]); ylim([-.23 .23]);
        title(sprintf('Assumed support margin %.0f mm',1000*margins(k)));
        if k==round(numel(t)/2)+3
            exportgraphics(fig,fullfile(out,'hexapod_preview.png'),'Resolution',180);
        end
        drawnow;
    end
end
close(fig);
f=figure('Color','w','Position',[100 100 1100 500],'Visible','off');
subplot(1,2,1); plot(t,rad2deg(Q(:,1:3)),'LineWidth',1.6); grid on;
xlabel('Time (s)'); ylabel('Angle (degrees)'); title('Left front ideal joint angles');
legend('Hip yaw','Hip pitch','Knee pitch','Location','best');
subplot(1,2,2); plot(t,1000*margins,'LineWidth',1.6,'Color',[.1 .5 .5]); grid on;
xlabel('Time (s)'); ylabel('Geometric margin (mm)'); title('Assumed flat-ground support');
exportgraphics(f,fullfile(out,'gait_checks.png'),'Resolution',180); close(f);
names={'time_s'};
for j=1:6
 for a={'yaw','pitch','knee'}, names{end+1}=[p.legName{j} '_' a{1} '_rad']; end
end
writetable(array2table([t' Q],'VariableNames',names),fullfile(out,'joint_angles.csv'));
results.maxFKError_m=err;
results.minGeometricMargin_m=min(margins);
results.maxJointRate_rad_s=max(abs(diff(Q)/p.dt),[],'all');
results.note='Kinematic preview only; stance contacts and COM are assumed.';
save(fullfile(out,'results.mat'),'results','p');
disp(results);
end
