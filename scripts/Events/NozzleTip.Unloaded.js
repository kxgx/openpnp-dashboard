// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// NozzleTip.Unloaded - nozzle tip unloaded
postToDashboard({
    nozzleTip: ""
});
