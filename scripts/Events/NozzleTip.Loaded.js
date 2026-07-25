// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// NozzleTip.Loaded - nozzle tip loaded
var tipName = "";
try { tipName = nozzleTip.getName(); } catch (e) {}

postToDashboard({
    nozzleTip: tipName
});
