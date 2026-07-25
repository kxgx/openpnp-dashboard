// Load shared Dashboard communication library
load("../httpBasic.js");

// Job.Placement.Complete - update placement progress
var totalActivePlacements = job.getTotalActivePlacements();
var activePlacements = job.getActivePlacements();

postToDashboard({
    done: totalActivePlacements - activePlacements,
    total: totalActivePlacements,
    state: ""
});
