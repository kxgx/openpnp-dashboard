// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Job.BeforeDiscard - about to discard a part
var partId = "Unknown";
try { partId = part.getId(); } catch (e) {}
var nozzleName = "";
try { nozzleName = nozzle.getName(); } catch (e) {}

postToDashboard({
    warningMsg: "⚠ 抛料: " + partId + " @ " + nozzleName
});
