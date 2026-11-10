function hx_bake_masses(mdl)
%HX_BAKE_MASSES  Write current base-workspace smiData inertia into File Solids.
%
%   Multibody Link File Solids use Mass_conf = 'compiletime'. Changing smiData
%   alone does not update a previously compiled model, and once Mass has been
%   rewritten as a literal, evaluating the Mass string no longer reads smiData.
%   So we map each File Solid to a Solid type via ExtGeomFileName and push the
%   current smiData.Solid(i).mass / MoI / PoI / CoM as numeric parameters.

smiData = evalin('base', 'smiData');
% Map STEP filename prefix -> Solid index
idx = containers.Map();
for i = 1:numel(smiData.Solid)
    id = char(smiData.Solid(i).ID);
    if isempty(id), continue; end
    % "MG996R_servo*:*Default" -> look for MG996R_servo in the STEP name
    prefix = regexprep(id, '\*.*$', '');   % strip *:*Default
    prefix = strtrim(prefix);
    if ~isempty(prefix), idx(lower(prefix)) = i; end
end

blks = find_system(mdl, 'LookUnderMasks', 'all', 'FollowLinks', 'on', 'Type', 'Block');
n = 0; unmatched = {};
for i = 1:numel(blks)
    r = get_param(blks{i}, 'ReferenceBlock');
    if ~contains(r, 'File Solid'), continue; end
    try
        if ~strcmpi(get_param(blks{i}, 'InertiaType'), 'Custom'), continue; end
        geom = get_param(blks{i}, 'ExtGeomFileName');   % e.g. mg996r-servo.step
        si = matchSolid(geom, idx);
        if isempty(si)
            unmatched{end+1} = geom; %#ok<AGROW>
            continue;
        end
        set_param(blks{i}, 'Mass', mat2str(smiData.Solid(si).mass, 17));
        set_param(blks{i}, 'MomentsOfInertia', mat2str(smiData.Solid(si).MoI, 17));
        set_param(blks{i}, 'ProductsOfInertia', mat2str(smiData.Solid(si).PoI, 17));
        set_param(blks{i}, 'CenterOfMass', mat2str(smiData.Solid(si).CoM, 17));
        n = n + 1;
    catch
    end
end
fprintf('Baked numeric inertia into %d File Solid blocks from smiData.\n', n);
if ~isempty(unmatched)
    warning('hx:bake', 'No smiData match for %d solids, e.g. %s', numel(unmatched), unmatched{1});
end
end

function si = matchSolid(geom, idx)
si = [];
g = normKey(geom);
keys = idx.keys;
% Prefer the longest part name so "Servo2 to Servo3 Connector" wins over a shorter key.
best = 0;
for k = 1:numel(keys)
    p = keys{k};
    if contains(g, normKey(p)) && strlength(p) > best
        best = strlength(p); si = idx(p);
    end
end
end

function s = normKey(s)
% "Servo1 to Servo 2 connector" and servo1-to-servo-2-connector.step compare equal.
s = lower(char(s));
s = regexprep(s, '[^a-z0-9]+', '-');
s = regexprep(s, '-+', '-');
s = regexprep(s, '^-|-$', '');
end
