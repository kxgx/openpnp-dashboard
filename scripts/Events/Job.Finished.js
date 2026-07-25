// Load shared Dashboard communication library
load("../httpBasic.js");

// Job.Finished (OpenPnP 2.6+) - notify dashboard job completed
var totalActivePlacements = job.getTotalActivePlacements();

postToDashboard({
    done: totalActivePlacements,
    total: totalActivePlacements,
    state: "COMPLETED"
});
