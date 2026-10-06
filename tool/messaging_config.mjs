import {validateWebEnvironment} from './web_environment.mjs';
export function generateMessagingConfig(config,environment){
 validateWebEnvironment(config,environment);
 const options={apiKey:config.TALLY_FIREBASE_API_KEY,appId:config.TALLY_FIREBASE_APP_ID,
  messagingSenderId:config.TALLY_FIREBASE_MESSAGING_SENDER_ID,projectId:config.TALLY_PROJECT_ID,
  authDomain:config.TALLY_FIREBASE_AUTH_DOMAIN,storageBucket:config.TALLY_FIREBASE_STORAGE_BUCKET};
 return `self.TALLY_MESSAGING_CONFIG=Object.freeze(${JSON.stringify(options)});\n`;
}
