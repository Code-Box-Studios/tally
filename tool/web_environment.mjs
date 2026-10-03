const required = [
  'TALLY_ENVIRONMENT', 'TALLY_PROJECT_ID', 'TALLY_FUNCTIONS_REGION',
  'TALLY_FIREBASE_API_KEY', 'TALLY_FIREBASE_APP_ID',
  'TALLY_FIREBASE_MESSAGING_SENDER_ID', 'TALLY_FIREBASE_AUTH_DOMAIN',
  'TALLY_FIREBASE_STORAGE_BUCKET', 'TALLY_APP_CHECK_WEB_SITE_KEY',
];

export function validateWebEnvironment(config, environment = 'production') {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).some(key => !required.includes(key)) ||
      required.some(key => typeof config[key] !== 'string' || !config[key].trim())) {
    throw new Error('Supply only the complete public Firebase web build configuration.');
  }
  const project = config.TALLY_PROJECT_ID;
  const app = /^1:([0-9]+):web:[a-zA-Z0-9]+$/.exec(config.TALLY_FIREBASE_APP_ID);
  if (config.TALLY_ENVIRONMENT !== environment || !['production', 'staging'].includes(environment) ||
      project.startsWith('demo-') || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) ||
      !/^AIza[A-Za-z0-9_-]{35}$/.test(config.TALLY_FIREBASE_API_KEY) ||
      !app || app[1] !== config.TALLY_FIREBASE_MESSAGING_SENDER_ID ||
      config.TALLY_FIREBASE_AUTH_DOMAIN !== `${project}.firebaseapp.com` ||
      ![`${project}.firebasestorage.app`, `${project}.appspot.com`].includes(config.TALLY_FIREBASE_STORAGE_BUCKET) ||
      !/^[a-z]+-[a-z]+[0-9]$/.test(config.TALLY_FUNCTIONS_REGION)) {
    throw new Error('Firebase web configuration does not match the selected environment.');
  }
}
