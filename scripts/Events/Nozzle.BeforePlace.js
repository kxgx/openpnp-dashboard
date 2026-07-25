// Load shared Dashboard communication library
load("../httpBasic.js");

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
