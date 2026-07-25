// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Nozzle.AfterPick - component picked successfully
var nozzleName = nozzle.getName();

postToDashboard({
    nozzles: [{
        id: nozzleName,
        isVacActive: true,
        isPicking: false,
        isPlacing: false,
        hasComponent: true
    }]
});
