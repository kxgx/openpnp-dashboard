// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Nozzle.BeforePlace - nozzle about to place a component
var nozzleName = nozzle.getName();

postToDashboard({
    nozzles: [{
        id: nozzleName,
        isVacActive: true,
        isPicking: false,
        isPlacing: true,
        hasComponent: false
    }]
});
