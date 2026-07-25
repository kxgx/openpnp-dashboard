// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
// Reset heartbeat guard so timer is re-created on fresh OpenPnP start
try { config.scriptState.put("dashboard-hb-started", "false"); } catch (e) {}
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Startup (OpenPnP 2.6+) - system bootup complete
postToDashboard({
    machineState: "STARTED"
});