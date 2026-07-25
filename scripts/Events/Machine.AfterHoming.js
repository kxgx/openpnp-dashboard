// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Machine.AfterHoming - machine homing complete
postToDashboard({
    machineState: "HOMED"
});
