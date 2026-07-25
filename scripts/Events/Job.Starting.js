// Load shared Dashboard communication library
load("../httpBasic.js");

// Job.Starting (OpenPnP 2.6+) - notify dashboard job is running
postToDashboard({
    state: "RUNNING"
});
