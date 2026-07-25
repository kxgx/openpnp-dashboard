// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Feeder.Fault - feeder error
var feederName = "Unknown";
try { feederName = feeder.getName(); } catch (e) {}
var errMsg = "";
try { errMsg = error.getMessage ? error.getMessage() : String(error); } catch (e2) {}

postToDashboard({
    errorMsg: "供料器故障: " + feederName + " - " + errMsg
});
