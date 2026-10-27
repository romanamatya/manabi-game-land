// Public web configuration only. NEVER put a password or service-account key here.
// Owner confirmed that the dedicated Spark project and Rules are set up.
// apiKey/appId must be read from that registered Web app before enabling.
window.MANABI_SPARK_CONFIG = Object.freeze({
  enabled: false,
  environment: 'previewSpark/v1',
  expectedProjectId: 'manabi-game-landcheck',
  firebase: {
    apiKey: '',
    authDomain: 'manabi-game-landcheck.firebaseapp.com',
    projectId: 'manabi-game-landcheck',
    appId: ''
  }
});
