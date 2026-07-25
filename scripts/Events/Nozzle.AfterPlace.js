// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Nozzle.AfterPlace - component placed successfully
var nozzleName = nozzle.getName();

postToDashboard({
    nozzles: [{
        id: nozzleName,
        isVacActive: false,
        isPicking: false,
        isPlacing: false,
        hasComponent: false
    }]
});
