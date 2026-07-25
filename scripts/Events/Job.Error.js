// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Job.Error (OpenPnP 2.6+) - notify dashboard of error
postToDashboard({
    state: "ERROR"
});
