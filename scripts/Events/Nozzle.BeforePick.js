// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Nozzle.BeforePick - nozzle about to pick a component
var nozzleName = nozzle.getName();

postToDashboard({
    nozzles: [{
        id: nozzleName,
        isVacActive: true,
        isPicking: true,
        isPlacing: false,
        hasComponent: true
    }]
});
