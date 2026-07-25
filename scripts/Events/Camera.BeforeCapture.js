// Load shared Dashboard communication library (absolute path via OpenPnP scripting API)
load(scripting.getScriptsDirectory().getAbsolutePath() + "/httpBasic.js");

// Camera.BeforeCapture - camera capturing image
postToDashboard({
    feederActivity: "📷 拍照中"
});
