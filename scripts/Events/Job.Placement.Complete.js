// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Job.Placement.Complete - update placement progress
var totalActivePlacements = job.getTotalActivePlacements();
var activePlacements = job.getActivePlacements();

var partId = "";
var boardName = "";
try { partId = placement.getPart().getId(); } catch (e) {}
try { boardName = placement.getBoardLocation().getBoard().getName(); } catch (e) {}

postToDashboard({
    done: totalActivePlacements - activePlacements,
    total: totalActivePlacements,
    placementPart: partId,
    placementBoard: boardName
});