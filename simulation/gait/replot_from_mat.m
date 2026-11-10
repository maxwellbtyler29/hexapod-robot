% Re-make the figures from the saved results (no re-simulation)
here = fileparts(mfilename('fullpath')); cd(here);
load(fullfile(here, 'results', 'gait_study_v6.mat'), 'R', 'S', 'p');
hx_plots(R, S, p, fullfile(here, 'results'));
