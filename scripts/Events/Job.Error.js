// Load shared Dashboard communication library
load("../httpBasic.js");

// Job.Error (OpenPnP 2.6+) - notify dashboard of error
postToDashboard({
    state: "ERROR"
});
