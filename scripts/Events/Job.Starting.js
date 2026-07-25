// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Job.Starting (OpenPnP 2.6+) - notify dashboard job is running
postToDashboard({
    state: "RUNNING",
    jobName: job.getName(),
    total: job.getTotalActivePlacements(),
    machineState: machine.isEnabled() ? "ENABLED" : "DISABLED"
});