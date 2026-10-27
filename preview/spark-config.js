// Public web configuration only. NEVER put a password or service-account key here.
// Use a separate Spark project whose ID contains "preview". Keep disabled until
// Authentication, private/admin, private/revocation and the tested Rules are set up.
window.MANABI_SPARK_CONFIG = Object.freeze({
  enabled: false,
  environment: 'previewSpark/v1',
  expectedProjectId: '',
  firebase: {apiKey: '', authDomain: '', projectId: '', appId: ''}
});
