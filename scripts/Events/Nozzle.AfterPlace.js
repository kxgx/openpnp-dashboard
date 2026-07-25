// Load shared Dashboard communication library
load("../httpBasic.js");

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
