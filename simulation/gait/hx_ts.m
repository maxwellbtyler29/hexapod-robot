function y = hx_ts(out, name, t)
%HX_TS  Read a To Workspace timeseries from a sim output and sample it on t.
ts = out.get(name);
tt = ts.Time; d = ts.Data;
if ndims(d) == 3, d = permute(d, [3 1 2]); d = reshape(d, size(d, 1), []); end  % k x 1 x N -> N x k
if size(d, 1) ~= numel(tt) && size(d, 2) == numel(tt), d = d.'; end
[tt, ia] = unique(tt, 'last'); d = d(ia, :);
if numel(tt) == 1, y = repmat(d, numel(t), 1); return; end
y = interp1(tt, double(d), t(:), 'linear', 'extrap');
end
