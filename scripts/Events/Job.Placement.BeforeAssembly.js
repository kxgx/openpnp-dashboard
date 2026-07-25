// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Job.Placement.BeforeAssembly - about to start a placement
var partId = "";
var boardName = "";
try { partId = placement.getPart().getId(); } catch (e) {}
try { boardName = placement.getBoardLocation().getBoard().getName(); } catch (e) {}

postToDashboard({
    placementPart: partId,
    placementBoard: boardName
});
