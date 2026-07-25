// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Job.Placement.Complete - update placement progress
var totalActivePlacements = job.getTotalActivePlacements();
var activePlacements = job.getActivePlacements();

postToDashboard({
    done: totalActivePlacements - activePlacements,
    total: totalActivePlacements,
    state: ""
});
