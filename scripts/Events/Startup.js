// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Startup (OpenPnP 2.6+) - system bootup complete
postToDashboard({
    machineState: "STARTED"
});
