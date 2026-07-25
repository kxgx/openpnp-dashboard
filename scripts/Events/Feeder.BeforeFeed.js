// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Feeder.BeforeFeed - feeder is feeding a part
var feederName = "";
try { feederName = feeder.getName(); } catch (e) {}

postToDashboard({
    feederActivity: "供料: " + feederName
});
