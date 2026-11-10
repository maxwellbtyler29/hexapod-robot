function m = hx_total_mass(mdl)
%HX_TOTAL_MASS  Sum the mass of every File/Brick solid in the model (kg),
%   evaluating each block's Mass expression in the base workspace.
m = 0;
blks = find_system(mdl, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'Type', 'Block');
for i = 1:numel(blks)
    r = get_param(blks{i}, 'ReferenceBlock');
    if ~contains(r, 'File Solid'), continue; end      % the floor brick is not part of the robot
    try
        mt = get_param(blks{i}, 'InertiaType');
        if ~strcmpi(mt, 'Custom') && ~strcmpi(mt, 'CalculateFromGeometry'), continue; end
        mstr = get_param(blks{i}, 'Mass'); u = get_param(blks{i}, 'MassUnits');
        v = evalin('base', mstr);
        if strcmp(u, 'g'), v = v / 1000; end
        m = m + v;
    catch
    end
end
end
