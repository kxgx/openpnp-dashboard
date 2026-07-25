// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Job.Finished (OpenPnP 2.6+) - notify dashboard job completed
var totalActivePlacements = job.getTotalActivePlacements();

postToDashboard({
    done: totalActivePlacements,
    total: totalActivePlacements,
    state: "COMPLETED"
});
