// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Job.AfterDiscard - discard complete, clear warning
postToDashboard({
    warningMsg: ""
});
